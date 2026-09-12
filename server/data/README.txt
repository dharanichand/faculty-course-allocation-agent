COLLEGE-ALIGNED LARGE SYNTHETIC DATASET

This is a larger privacy-safe dataset for the Faculty Course Allocation Agent.

Records:
Faculty: 120
Departments: 8
Courses: 70
Course versions: 210
Faculty expertise: 889
Batches: 32
Sections: 96
Course offerings: 300
Faculty workloads: 120
Allocation candidates: 1500
Agent tools: 4

The structure mirrors the college schema concepts: people.faculty and faculty_expertise,
curriculum.course/course_version/batch/section, academics.course_offering,
hr.faculty_workload and agentops.agent/agent_tool.

faculty_allocation_candidates is a staging table for the current project UI; final approved
records should map to academics.faculty_allocation.

All names, emails and records are synthetic. IDs are UUIDs and relationships are internally consistent.
