@AGENTS.md


# CRITICAL RULES — MANDATORY
- NEVER delete or overwrite working tests without explicit permission
- NEVER delete files without confirmation
<!-- - ALWAYS run tests after any code changes -->
- ALWAYS create a git checkpoint before major refactorings
- One task at a time. DO NOT make multiple changes simultaneously
- Do exactly what is being asked. Do not try to do further steps
- If you're unsure — ASK, don't guess

# Working Style
- First, create a plan, show it to the user, and ask for approval before proceeding with the coding.
<!-- - Small changes: one file → tests → next file -->
- Use sub-agents to explore the codebase

# Agents
- Use the `planner` agent for planning
<!-- - Use the `tester` agent after code changes -->
<!-- - Use the `code-reviewer` agent before commits -->