# /review command

## Usage
/review <file_path>

## Instructions
Act as a Lead Engineer and Information Processing Security Support Specialist. 
Perform a rigorous code review of the provided file based on the project's specific standards.

### Review Steps
1. **Context Check**: Reference `.claude/rules/architecture.md` and `design.md`.
2. **Standard Verification**: Ensure the code follows the **Manager Pattern**.
3. **Security Check**: Identify potential vulnerabilities (e.g., sensitive data handling, insecure PDF processing).
4. **Implementation Check**: 
   - Check for **ArrayBuffer detachment** issues (must use `.slice()` before passing to workers).
   - Verify coordinate system logic (PDF vs Canvas).
   - Check for memory leaks (event listeners, object URLs).
5. **Consistency Check**: Verify that the code matches the functional requirements in `requirement.md`.

### Output Format
Please provide the review results in the following structure:
- **Summary**: A brief overview of the file's quality.
- **Critical Issues**: Bugs or security risks that must be fixed.
- **Refactoring & Optimization**: Suggestions for better performance or readability.
- **Design Consistency**: Any mismatch between this code and `design.md`.
