package edu.examly;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@SpringBootApplication
public class ExamlyApplication {
    public static void main(String[] args) { SpringApplication.run(ExamlyApplication.class, args); }

    @Bean
    CommandLineRunner provisionFaculty(JdbcTemplate db, Environment env) {
        return args -> {
            String email = env.getProperty("EXAMLY_FACULTY_EMAIL", "").trim().toLowerCase();
            String password = env.getProperty("EXAMLY_FACULTY_PASSWORD", "");
            if (email.isBlank() && password.isBlank()) return;
            if (email.isBlank() || !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$") || password.length() < 10 || password.length() > 72)
                throw new IllegalStateException("Set a valid EXAMLY_FACULTY_EMAIL and an EXAMLY_FACULTY_PASSWORD of 10–72 characters.");
            Integer exists = db.queryForObject("SELECT COUNT(*) FROM users WHERE email=?", Integer.class, email);
            if (exists != null && exists > 0) return;
            String name = env.getProperty("EXAMLY_FACULTY_NAME", "Faculty").trim();
            if (name.length() < 2 || name.length() > 80) name = "Faculty";
            db.update("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,'FACULTY',?)",
                    name, email, new BCryptPasswordEncoder(12).encode(password), System.currentTimeMillis());
        };
    }
}
