REAL DEPARTMENT DATA - AY 2026-27, ODD SEMESTER (CSE)

Files (keep exactly ONE workload file and ONE submissions file in this folder):
  Workload_AY__2026-27_I_Sem_3_.xlsx  courses, faculty, and the assignments (sheet "Faculty WL")
  submissions_2026-05-07.xlsx         faculty course-preference form responses

Load into MongoDB:
  cd server
  npm run import:workload -- --dry    build + verify only, writes nothing
  npm run import:workload             replace faculty/courses/allocations in MongoDB
  npm run import:workload -- --status=recommended   store sheet assignments as "recommended" instead of "approved"

Rules:
  * Every "Faculty WL" course row becomes exactly one allocation (faculty, course, section, students, hours).
    The import re-reads MongoDB afterwards and fails if anything differs from the workbook.
  * People are matched across the two files by name as well as employee number.
    The workload sheet's employee number is the facultyId.
  * Faculty who submitted keep their submitted preferences; faculty who did not get their
    currently assigned courses as preferences.
  * Courses used in Faculty WL but missing from "List of Courses" are added (catalogSource != list-of-courses).
