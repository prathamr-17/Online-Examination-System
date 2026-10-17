# Examly

Examly is a Next.js frontend backed by a Java 17 / Spring Boot API. The existing UI calls `/api/examly/*`; the Next.js route forwards those requests to the Java service at `http://127.0.0.1:8080` by default. The UI files and styling remain unchanged.

## Run locally

1. Install Java 17+, Maven 3.9+, Node.js, and pnpm.
2. In one terminal, start the API:

   ```powershell
   $env:EXAMLY_FACULTY_EMAIL = "faculty@example.edu"
   $env:EXAMLY_FACULTY_PASSWORD = "use-a-unique-password-of-10-chars-or-more"
   mvn -f backend/pom.xml spring-boot:run
   ```

   The faculty account is provisioned on first startup. Omit those variables to disable faculty provisioning. H2 stores data in `backend/data/examly`; the schema is initialized automatically.

3. In another terminal, install and run the frontend:

   ```powershell
   pnpm install
   pnpm dev
   ```

   Open the URL printed by Next.js. Set `JAVA_API_URL` if the API is hosted somewhere other than `http://127.0.0.1:8080`.

## Backend behavior

- Students register only as students. Faculty accounts are provisioned from server environment variables; the browser cannot grant itself faculty access.
- Passwords are BCrypt-hashed. Random bearer tokens are stored as SHA-256 hashes and sent to the browser only through the existing Next.js proxy, which sets an HttpOnly session cookie.
- Exams, questions, attempts, saved answers, grades, and integrity events persist in H2. Answer keys stay server-side. Student exam question and choice order is randomized per attempt.
- The server enforces opening and closing times, attempt duration, answer ownership, one attempt per student/exam, role checks, grading bounds, and automatic multiple-choice grading. Written answers remain pending until faculty grades them.
- Activity events record tab visibility, fullscreen exit, and copy/paste attempts. They are review signals only; they do not automatically penalize a student and no camera or microphone is used.

For a deployed system, use HTTPS, a strong database password and a managed production database, and provision faculty credentials through a protected administrator workflow. The included H2 setup is intended for a local mini project/demo.
