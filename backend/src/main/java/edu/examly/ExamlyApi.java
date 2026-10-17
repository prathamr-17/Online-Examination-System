package edu.examly;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api")
public class ExamlyApi {
    private static final long SESSION_MS = 8 * 60 * 60 * 1000L;
    private static final Set<String> EVENT_TYPES = Set.of("TAB_HIDDEN", "FULLSCREEN_EXIT", "COPY_ATTEMPT", "PASTE_ATTEMPT");
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    private final SecureRandom random = new SecureRandom();

    public ExamlyApi(JdbcTemplate db, ObjectMapper json) { this.db = db; this.json = json; }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> handle(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(Map.of("message", e.getReason() == null ? "Request could not be completed." : e.getReason()));
    }

    @ExceptionHandler(DuplicateKeyException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    @ResponseBody Map<String, String> duplicate() { return Map.of("message", "An account with that email already exists."); }

    @GetMapping("/health") Map<String, Object> health() { return Map.of("status", "ok", "service", "examly-java-api"); }

    @PostMapping("/auth/register")
    Map<String, Object> register(@RequestBody JsonNode body) {
        String name = text(body, "name", 2, 80), email = email(body), password = password(body);
        long id;
        try {
            db.update("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,'STUDENT',?)", name, email, passwords.encode(password), now());
            id = db.queryForObject("SELECT id FROM users WHERE email=?", Long.class, email);
        } catch (DuplicateKeyException e) { throw problem(HttpStatus.CONFLICT, "An account with that email already exists."); }
        return createSession(id);
    }

    @PostMapping("/auth/login")
    Map<String, Object> login(@RequestBody JsonNode body) {
        String email = email(body), pass = body.path("password").asText("");
        var matches = db.query("SELECT id,name,email,password_hash,role FROM users WHERE email=?", (rs, n) -> {
            if (!passwords.matches(pass, rs.getString("password_hash"))) return null;
            return user(rs.getLong("id"), rs.getString("name"), rs.getString("email"), rs.getString("role"));
        }, email);
        if (matches.isEmpty() || matches.get(0) == null) throw problem(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
        long id = ((Number) matches.get(0).get("id")).longValue();
        return createSession(id);
    }

    @GetMapping("/auth/me") Map<String, Object> me(@RequestHeader(value="Authorization", required=false) String auth) {
        Map<String,Object> u = current(auth); return Collections.singletonMap("user", u);
    }

    @PostMapping("/auth/logout") Map<String, Object> logout(@RequestHeader(value="Authorization", required=false) String auth) {
        String token = token(auth); if (token != null) db.update("UPDATE sessions SET revoked=TRUE WHERE token_hash=?", sha(token));
        return Map.of("ok", true);
    }

    @GetMapping("/exams")
    List<Map<String,Object>> exams() {
        return db.query("SELECT e.*, (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) question_count FROM exams e ORDER BY e.starts_at", (rs,n) -> examMap(
                rs.getLong("id"), rs.getString("title"), rs.getString("subject"), rs.getString("type"), rs.getInt("minutes"), rs.getLong("starts_at"), rs.getLong("ends_at"), rs.getInt("question_count"), rs.getString("description"), rs.getString("color")));
    }

    @GetMapping("/results")
    @Transactional
    List<Map<String,Object>> results(@RequestHeader(value="Authorization", required=false) String auth) {
        Map<String,Object> u = requireUser(auth); requireRole(u,"STUDENT");
        List<Long> expired=db.query("SELECT id FROM attempts WHERE student_id=? AND submitted_at IS NULL AND deadline<=?",(rs,n)->rs.getLong(1),u.get("id"),now());
        expired.forEach(this::finish);
        return db.query("SELECT a.id,a.exam_id,e.title,e.subject,e.owner_id,a.status,a.submitted_at,a.warnings,COALESCE((SELECT SUM(awarded) FROM answers an WHERE an.attempt_id=a.id),0) score,(SELECT COALESCE(SUM(marks),0) FROM questions q WHERE q.exam_id=e.id) total FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.student_id=? AND a.submitted_at IS NOT NULL ORDER BY a.submitted_at DESC", (rs,n)->resultMap(rs,false), u.get("id"));
    }

    @PostMapping("/exams/{examId}/start")
    @Transactional
    Map<String,Object> start(@PathVariable long examId, @RequestHeader(value="Authorization", required=false) String auth) {
        Map<String,Object> u = requireUser(auth); requireRole(u,"STUDENT"); long userId=num(u,"id"), now=now();
        Map<String,Object> exam = exam(examId);
        List<Long> existing = db.query("SELECT id FROM attempts WHERE exam_id=? AND student_id=?", (r,n)->r.getLong(1), examId,userId);
        long attemptId;
        if (!existing.isEmpty()) {
            attemptId=existing.get(0);
            Map<String,Object> old=attemptRow(attemptId);
            if (old.get("submitted_at") != null) throw problem(HttpStatus.CONFLICT,"You have already submitted this exam.");
            if (now >= num(old,"deadline")) { finish(attemptId); throw problem(HttpStatus.CONFLICT,"Your exam time has ended. Your saved answers have been submitted."); }
        } else {
            if (now < num(exam,"startsAt")) throw problem(HttpStatus.CONFLICT,"This exam has not opened yet.");
            if (now >= num(exam,"endsAt")) throw problem(HttpStatus.CONFLICT,"This exam has closed.");
            long durationEnd = now + num(exam,"minutes")*60_000L;
            long deadline = Math.min(durationEnd, num(exam,"endsAt"));
            db.update("INSERT INTO attempts(exam_id,student_id,started_at,deadline,status,warnings) VALUES(?,?,?,?, 'IN_PROGRESS',0)",examId,userId,now,deadline);
            attemptId=db.queryForObject("SELECT id FROM attempts WHERE exam_id=? AND student_id=?",Long.class,examId,userId);
            for (Map<String,Object> q: questions(examId,false)) db.update("INSERT INTO answers(attempt_id,question_id,answer) VALUES(?,?,'')",attemptId,q.get("id"));
        }
        return attemptMap(attemptId);
    }

    @PutMapping("/attempts/{id}/answers")
    @Transactional
    Map<String,Object> saveAnswer(@PathVariable long id,@RequestBody JsonNode body,@RequestHeader(value="Authorization", required=false) String auth) {
        Map<String,Object> a=ownedAttempt(id,auth); active(a);
        long questionId=body.path("questionId").asLong(-1); String answer=body.path("answer").asText("");
        if(answer.length()>4000) throw problem(HttpStatus.BAD_REQUEST,"Answer is too long.");
        int changed=db.update("UPDATE answers SET answer=? WHERE attempt_id=? AND question_id=?",answer,id,questionId);
        if(changed==0) throw problem(HttpStatus.BAD_REQUEST,"Question does not belong to this exam.");
        return Map.of("saved",true);
    }

    @PostMapping("/attempts/{id}/events")
    @Transactional
    Map<String,Object> event(@PathVariable long id,@RequestBody JsonNode body,@RequestHeader(value="Authorization", required=false) String auth) {
        Map<String,Object> a=ownedAttempt(id,auth); active(a); String type=body.path("type").asText("");
        if(!EVENT_TYPES.contains(type)) throw problem(HttpStatus.BAD_REQUEST,"Unsupported activity event.");
        long cutoff=now()-2500;
        int recent=db.queryForObject("SELECT COUNT(*) FROM integrity_events WHERE attempt_id=? AND type=? AND created_at>?",Integer.class,id,type,cutoff);
        if(recent==0) db.update("INSERT INTO integrity_events(attempt_id,type,created_at) VALUES(?,?,?)",id,type,now());
        int count=db.queryForObject("SELECT COUNT(*) FROM integrity_events WHERE attempt_id=?",Integer.class,id);
        db.update("UPDATE attempts SET warnings=? WHERE id=?",count,id);
        return Map.of("warnings",count);
    }

    @PostMapping("/attempts/{id}/submit")
    @Transactional
    Map<String,Object> submit(@PathVariable long id,@RequestBody(required=false) JsonNode body,@RequestHeader(value="Authorization", required=false) String auth) {
        Map<String,Object> a=ownedAttempt(id,auth);
        if(a.get("submitted_at") != null) throw problem(HttpStatus.CONFLICT,"This attempt has already been submitted.");
        if(now() < num(a,"deadline") && body != null && body.has("answers") && body.get("answers").isObject()) {
            body.get("answers").fields().forEachRemaining(entry -> {
                try { long q=Long.parseLong(entry.getKey()); if(entry.getValue().isTextual()) db.update("UPDATE answers SET answer=? WHERE attempt_id=? AND question_id=?",entry.getValue().asText().substring(0,Math.min(4000,entry.getValue().asText().length())),id,q); }
                catch(NumberFormatException ignored) { }
            });
        }
        finish(id); return resultForAttempt(id,false);
    }

    @PostMapping("/faculty/exams")
    @Transactional
    Map<String,Object> createExam(@RequestBody JsonNode body,@RequestHeader(value="Authorization", required=false) String auth) {
        Map<String,Object> u=requireUser(auth); requireRole(u,"FACULTY");
        String title=text(body,"title",1,120), subject=text(body,"subject",1,80), desc=text(body,"description",1,2000);
        String type=enumText(body,"type",Set.of("MCQ","TRUE_FALSE","SHORT_ANSWER","MIXED"));
        int minutes=body.path("minutes").asInt(0); long starts=body.path("startsAt").asLong(-1),ends=body.path("endsAt").asLong(-1);
        JsonNode qs=body.path("questions");
        if(minutes<1||minutes>180||starts<now()-60_000||ends<=starts||qs.isMissingNode()||!qs.isArray()||qs.isEmpty()||qs.size()>100) throw problem(HttpStatus.BAD_REQUEST,"Check the exam schedule, duration, and questions.");
        db.update("INSERT INTO exams(owner_id,title,subject,description,type,minutes,starts_at,ends_at,color,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",u.get("id"),title,subject,desc,type,minutes,starts,ends,"green",now());
        long examId=db.queryForObject("SELECT MAX(id) FROM exams WHERE owner_id=?",Long.class,u.get("id"));
        int pos=0;
        for(JsonNode q:qs) {
            String qt=enumText(q,"type",Set.of("MCQ","TRUE_FALSE","SHORT_ANSWER"));
            if(!type.equals("MIXED")&&!type.equals(qt)) throw problem(HttpStatus.BAD_REQUEST,"Question format does not match exam format.");
            String prompt=text(q,"prompt",1,2000); int marks=q.path("marks").asInt(0);
            if(marks<1||marks>20) throw problem(HttpStatus.BAD_REQUEST,"Each question must have between 1 and 20 marks.");
            List<String> options=new ArrayList<>();
            if(q.path("options").isArray()) {
                for(JsonNode o:q.path("options")) {
                    if(o.isTextual()) options.add(o.asText());
                }
            }
            String correct=q.path("correctAnswer").asText("");
            if(qt.equals("MCQ")) {
                if(options.size()!=4||options.stream().anyMatch(s->s.isBlank()||s.length()>500)||new HashSet<>(options).size()!=4||!options.contains(correct)) throw problem(HttpStatus.BAD_REQUEST,"Multiple choice questions need four unique options and one correct answer.");
            } else if(qt.equals("TRUE_FALSE")) {
                options=List.of("True","False"); if(!Set.of("True","False").contains(correct)) throw problem(HttpStatus.BAD_REQUEST,"Choose True or False as the correct answer.");
            } else { options=List.of(); correct=null; }
            try { db.update("INSERT INTO questions(exam_id,prompt,type,options_json,correct_answer,marks,position) VALUES(?,?,?,?,?,?,?)",examId,prompt,qt,json.writeValueAsString(options),correct,marks,pos++); }
            catch(Exception e){ throw new IllegalStateException(e); }
        }
        return Map.of("exam",exam(examId));
    }

    @GetMapping("/faculty/results")
    List<Map<String,Object>> facultyResults(@RequestHeader(value="Authorization", required=false) String auth) {
        Map<String,Object> u=requireUser(auth); requireRole(u,"FACULTY");
        return db.query("SELECT a.id,a.exam_id,e.title,e.subject,e.owner_id,a.status,a.submitted_at,a.warnings,COALESCE((SELECT SUM(awarded) FROM answers an WHERE an.attempt_id=a.id),0) score,(SELECT COALESCE(SUM(marks),0) FROM questions q WHERE q.exam_id=e.id) total,s.name student_name,s.email student_email FROM attempts a JOIN exams e ON e.id=a.exam_id JOIN users s ON s.id=a.student_id WHERE e.owner_id=? AND a.submitted_at IS NOT NULL ORDER BY a.submitted_at DESC",(rs,n)->resultMap(rs,true),u.get("id"));
    }

    @GetMapping("/faculty/attempts/{id}")
    Map<String,Object> review(@PathVariable long id,@RequestHeader(value="Authorization", required=false) String auth) {
        Map<String,Object> u=requireUser(auth); requireRole(u,"FACULTY"); Map<String,Object> result=resultForAttempt(id,true);
        if (attemptRow(id).get("submitted_at") == null) throw problem(HttpStatus.CONFLICT,"This exam has not been submitted.");
        if(!Objects.equals(result.get("ownerId"),u.get("id"))) throw problem(HttpStatus.FORBIDDEN,"You cannot review this submission.");
        Map<String,Object> publicResult=new LinkedHashMap<>(result); publicResult.remove("ownerId");
        List<Map<String,Object>> qs=db.query("SELECT q.id,q.prompt,q.type,q.marks,a.answer,COALESCE(g.awarded,an.awarded) awarded FROM questions q JOIN answers an ON an.question_id=q.id AND an.attempt_id=? LEFT JOIN grades g ON g.question_id=q.id AND g.attempt_id=? WHERE q.exam_id=(SELECT exam_id FROM attempts WHERE id=?) ORDER BY q.position",(rs,n)->{Map<String,Object> m=new LinkedHashMap<>();m.put("id",rs.getLong("id"));m.put("prompt",rs.getString("prompt"));m.put("type",rs.getString("type"));m.put("marks",rs.getInt("marks"));m.put("answer",rs.getString("answer"));Object awarded=rs.getObject("awarded");m.put("awarded",awarded==null?null:((Number)awarded).intValue());return m;},id,id,id);
        List<Map<String,Object>> events=db.query("SELECT type,created_at FROM integrity_events WHERE attempt_id=? ORDER BY created_at",(rs,n)->Map.of("type",rs.getString("type"),"createdAt",rs.getLong("created_at")),id);
        return Map.of("result",publicResult,"questions",qs,"events",events);
    }

    @PostMapping("/faculty/attempts/{id}/grade")
    @Transactional
    Map<String,Object> grade(@PathVariable long id,@RequestBody JsonNode body,@RequestHeader(value="Authorization", required=false) String auth) {
        Map<String,Object> u=requireUser(auth); requireRole(u,"FACULTY"); Map<String,Object> a=attemptRow(id);
        if(!Objects.equals(exam(num(a,"exam_id")).get("ownerId"),u.get("id"))) throw problem(HttpStatus.FORBIDDEN,"You cannot grade this submission.");
        if(a.get("submitted_at")==null) throw problem(HttpStatus.CONFLICT,"This exam has not been submitted.");
        JsonNode grades=body.path("grades"); if(!grades.isArray()) throw problem(HttpStatus.BAD_REQUEST,"Grades are required.");
        for(JsonNode g:grades) {
            long qid=g.path("questionId").asLong(-1); int awarded=g.path("awarded").asInt(-1);
            List<Integer> marks=db.query("SELECT q.marks FROM questions q WHERE q.id=? AND q.exam_id=? AND q.type='SHORT_ANSWER'",(rs,n)->rs.getInt(1),qid,num(a,"exam_id"));
            if(marks.isEmpty()||awarded<0||awarded>marks.get(0)) throw problem(HttpStatus.BAD_REQUEST,"A grade is outside the allowed range.");
            db.update("MERGE INTO grades(attempt_id,question_id,awarded) KEY(attempt_id,question_id) VALUES(?,?,?)",id,qid,awarded);
        }
        int pending=db.queryForObject("SELECT COUNT(*) FROM questions q JOIN answers an ON an.question_id=q.id AND an.attempt_id=? LEFT JOIN grades g ON g.question_id=q.id AND g.attempt_id=? WHERE q.exam_id=? AND q.type='SHORT_ANSWER' AND g.question_id IS NULL",Integer.class,id,id,num(a,"exam_id"));
        if(pending>0) throw problem(HttpStatus.BAD_REQUEST,"Grade every written answer before releasing results.");
        db.update("UPDATE attempts SET status='GRADED' WHERE id=?",id);
        db.update("UPDATE answers SET awarded=(SELECT awarded FROM grades g WHERE g.attempt_id=answers.attempt_id AND g.question_id=answers.question_id) WHERE attempt_id=? AND question_id IN (SELECT id FROM questions WHERE type='SHORT_ANSWER')",id);
        return resultForAttempt(id,true);
    }

    private Map<String,Object> createSession(long id) {
        Map<String,Object> u=userById(id); byte[] bytes=new byte[32];random.nextBytes(bytes);String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        db.update("INSERT INTO sessions(token_hash,user_id,expires_at,revoked) VALUES(?,?,?,FALSE)",sha(token),id,now()+SESSION_MS);
        Map<String,Object> out=new LinkedHashMap<>();out.put("user",u);out.put("token",token);return out;
    }
    private Map<String,Object> current(String auth) { String raw=token(auth); if(raw==null)return null; List<Map<String,Object>> users=db.query("SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked=FALSE AND s.expires_at>?",(rs,n)->user(rs.getLong("id"),rs.getString("name"),rs.getString("email"),rs.getString("role")),sha(raw),now());return users.isEmpty()?null:users.get(0); }
    private Map<String,Object> requireUser(String auth) { Map<String,Object> u=current(auth);if(u==null)throw problem(HttpStatus.UNAUTHORIZED,"Please sign in to continue.");return u; }
    private void requireRole(Map<String,Object> u,String role){if(!role.equals(u.get("role")))throw problem(HttpStatus.FORBIDDEN,"This action is not available for your account.");}
    private Map<String,Object> userById(long id){return db.queryForObject("SELECT id,name,email,role FROM users WHERE id=?",(rs,n)->user(rs.getLong("id"),rs.getString("name"),rs.getString("email"),rs.getString("role")),id);}
    private Map<String,Object> user(long id,String name,String email,String role){return Map.of("id",id,"name",name,"email",email,"role",role);}
    private Map<String,Object> exam(long id){return db.queryForObject("SELECT e.*, (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) question_count FROM exams e WHERE e.id=?",(rs,n)->{Map<String,Object> m=new LinkedHashMap<>(examMap(rs.getLong("id"),rs.getString("title"),rs.getString("subject"),rs.getString("type"),rs.getInt("minutes"),rs.getLong("starts_at"),rs.getLong("ends_at"),rs.getInt("question_count"),rs.getString("description"),rs.getString("color")));m.put("ownerId",rs.getLong("owner_id"));return m;},id);}
    private Map<String,Object> examMap(long id,String title,String subject,String type,int minutes,long starts,long ends,int count,String desc,String color){return Map.of("id",id,"title",title,"subject",subject,"type",type,"minutes",minutes,"startsAt",starts,"endsAt",ends,"questionCount",count,"description",desc,"color",color);}
    private List<Map<String,Object>> questions(long examId,boolean reveal) {
        return db.query("SELECT * FROM questions WHERE exam_id=? ORDER BY position",(rs,n)->{Map<String,Object> m=new LinkedHashMap<>();m.put("id",rs.getLong("id"));m.put("prompt",rs.getString("prompt"));m.put("type",rs.getString("type"));try{m.put("options",json.readValue(rs.getString("options_json"),new TypeReference<List<String>>(){}));}catch(Exception e){throw new IllegalStateException(e);}m.put("marks",rs.getInt("marks"));if(reveal)m.put("correctAnswer",rs.getString("correct_answer"));return m;},examId);
    }
    private Map<String,Object> attemptMap(long id) {
        Map<String,Object> a=attemptRow(id); long examId=num(a,"exam_id"); List<Map<String,Object>> qs=questions(examId,false);
        Random seeded=new Random(id*1103515245L+31);Collections.shuffle(qs,seeded);
        List<Map<String,Object>> safe=new ArrayList<>();Map<String,String> answers=new LinkedHashMap<>();
        for(Map<String,Object> q:qs){List<String> options=new ArrayList<>((List<String>)q.get("options"));Collections.shuffle(options,seeded);Map<String,Object> copy=new LinkedHashMap<>(q);copy.put("options",options);safe.add(copy);List<Map<String,Object>> answer=db.query("SELECT answer FROM answers WHERE attempt_id=? AND question_id=?",(r,n)->Map.<String,Object>of("answer",r.getString(1)),id,q.get("id"));answers.put(String.valueOf(q.get("id")),answer.isEmpty()?"":(String)answer.get(0).get("answer"));}
        return Map.of("id",id,"examId",examId,"title",exam(num(a,"exam_id")).get("title"),"deadline",a.get("deadline"),"serverNow",now(),"status",a.get("status"),"questions",safe,"answers",answers,"warnings",a.get("warnings"));
    }
    private Map<String,Object> attemptRow(long id){return db.queryForObject("SELECT * FROM attempts WHERE id=?",(rs,n)->{Map<String,Object>m=new HashMap<>();m.put("id",rs.getLong("id"));m.put("exam_id",rs.getLong("exam_id"));m.put("student_id",rs.getLong("student_id"));m.put("deadline",rs.getLong("deadline"));m.put("submitted_at",(Long)rs.getObject("submitted_at"));m.put("status",rs.getString("status"));m.put("warnings",rs.getInt("warnings"));return m;},id);}
    private Map<String,Object> ownedAttempt(long id,String auth){Map<String,Object>u=requireUser(auth);requireRole(u,"STUDENT");Map<String,Object>a=attemptRow(id);if(!Objects.equals(a.get("student_id"),u.get("id")))throw problem(HttpStatus.FORBIDDEN,"This attempt belongs to another student.");return a;}
    private void active(Map<String,Object>a){if(a.get("submitted_at")!=null)throw problem(HttpStatus.CONFLICT,"This attempt has already been submitted.");if(now()>=num(a,"deadline")){finish(num(a,"id"));throw problem(HttpStatus.CONFLICT,"Your exam time has ended. Your saved answers have been submitted.");}}
    private void finish(long id){Map<String,Object>a=attemptRow(id);if(a.get("submitted_at")!=null)return;long examId=num(a,"exam_id");
        db.update("UPDATE answers SET awarded=CASE WHEN EXISTS(SELECT 1 FROM questions q WHERE q.id=answers.question_id AND q.type='SHORT_ANSWER') THEN NULL WHEN answer=(SELECT correct_answer FROM questions q WHERE q.id=answers.question_id) THEN (SELECT marks FROM questions q WHERE q.id=answers.question_id) ELSE 0 END WHERE attempt_id=?",id);
        int written=db.queryForObject("SELECT COUNT(*) FROM questions WHERE exam_id=? AND type='SHORT_ANSWER'",Integer.class,examId);
        db.update("UPDATE attempts SET submitted_at=?,status=? WHERE id=?",now(),written>0?"PENDING_REVIEW":"GRADED",id);
    }
    private Map<String,Object> resultForAttempt(long id,boolean withOwner){Map<String,Object> a=attemptRow(id);Map<String,Object>e=exam(num(a,"exam_id"));
        int score=db.queryForObject("SELECT COALESCE(SUM(awarded),0) FROM answers WHERE attempt_id=?",Integer.class,id),total=db.queryForObject("SELECT COALESCE(SUM(marks),0) FROM questions WHERE exam_id=?",Integer.class,num(a,"exam_id"));
        Map<String,Object>m=new LinkedHashMap<>();m.put("id",id);m.put("examId",num(a,"exam_id"));m.put("title",e.get("title"));m.put("subject",e.get("subject"));m.put("score",score);m.put("total",total);m.put("status",a.get("status"));m.put("submittedAt",a.get("submitted_at") == null ? now() : a.get("submitted_at"));m.put("warnings",a.get("warnings"));m.put("studentName",userById(num(a,"student_id")).get("name"));m.put("studentEmail",userById(num(a,"student_id")).get("email"));if(withOwner)m.put("ownerId",e.get("ownerId"));return m;}
    private Map<String,Object> resultMap(java.sql.ResultSet rs,boolean faculty)throws java.sql.SQLException{Map<String,Object>m=new LinkedHashMap<>();m.put("id",rs.getLong("id"));m.put("examId",rs.getLong("exam_id"));m.put("title",rs.getString("title"));m.put("subject",rs.getString("subject"));m.put("score",rs.getInt("score"));m.put("total",rs.getInt("total"));m.put("status",rs.getString("status"));m.put("submittedAt",rs.getLong("submitted_at"));m.put("warnings",rs.getInt("warnings"));if(faculty){m.put("studentName",rs.getString("student_name"));m.put("studentEmail",rs.getString("student_email"));}return m;}
    private String email(JsonNode b){String s=b.path("email").asText("").trim().toLowerCase(Locale.ROOT);if(s.length()>180||!s.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))throw problem(HttpStatus.BAD_REQUEST,"Enter a valid email address.");return s;}
    private String password(JsonNode b){String p=b.path("password").asText("");if(p.length()<10||p.length()>72)throw problem(HttpStatus.BAD_REQUEST,"Password must be between 10 and 72 characters.");return p;}
    private String text(JsonNode b,String field,int min,int max){String s=b.path(field).asText("").trim();if(s.length()<min||s.length()>max)throw problem(HttpStatus.BAD_REQUEST,"Check the " + field + " field.");return s;}
    private String enumText(JsonNode b,String field,Set<String>allowed){String s=b.path(field).asText("");if(!allowed.contains(s))throw problem(HttpStatus.BAD_REQUEST,"Invalid " + field + " value.");return s;}
    private static long now(){return Instant.now().toEpochMilli();}
    private static long num(Map<String,Object>m,String key){return ((Number)m.get(key)).longValue();}
    private String token(String auth){return auth!=null&&auth.startsWith("Bearer ")?auth.substring(7).trim():null;}
    private String sha(String input){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private ResponseStatusException problem(HttpStatus status,String message){return new ResponseStatusException(status,message);}
}
