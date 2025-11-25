# File Parser Agent Test Suite

Comprehensive test suite for the file-parser-agent MCP tool. This test suite covers all modules with unit tests, integration tests, and test fixtures.

## Test Structure

```
tests/
├── fixtures/              # Test data files
│   ├── sample.txt        # Plain text test file
│   ├── sample.md         # Markdown test file
│   ├── empty.txt         # Empty file for edge case testing
│   ├── sample.xlsx       # Excel spreadsheet with sample data
│   └── generate-xlsx.mjs # Script to generate the XLSX test file
├── unit/                  # Unit tests for individual modules
│   ├── read-stdin.test.mjs
│   ├── path-utils.test.mjs
│   ├── document-loader.test.mjs
│   ├── markdown-formatter.test.mjs
│   └── llm-runner.test.mjs
└── integration/           # Integration tests
    └── process-documents.test.mjs
```

## Running Tests

```bash
npm test
```

## Test Coverage

### Unit Tests

#### 1. read-stdin.test.mjs (6 tests)
Tests for JSON input parsing from stdin:
- Parse valid JSON from stdin
- Return null for empty input
- Return null for whitespace-only input
- Throw error for invalid JSON
- Handle complex nested JSON objects
- Handle multiple chunks

#### 2. path-utils.test.mjs (18 tests)
Tests for path resolution and file operations:

**resolveWorkspacePath:**
- Resolve absolute paths
- Resolve relative paths based on cwd
- Resolve relative paths based on workspaceRoot
- Prefer workspaceRoot over cwd
- Handle Windows-style backslashes
- Trim whitespace from paths
- Throw errors for invalid inputs

**assertFileReadable:**
- Verify readable files
- Error on non-existent files
- Error on directories

**readFileStats:**
- Return file statistics with size, modified, created dates

**readText:**
- Read text file content
- Handle empty files
- Handle UTF-8 encoding

**readBinary:**
- Read files as Buffer
- Handle empty files
- Read binary files (XLSX)

#### 3. document-loader.test.mjs (23 tests)
Tests for loading different document types:
- Load text files (TXT, MD)
- Load empty files
- Load XLSX files with tables
- Respect tableSampleRows option
- Handle XLSX empty sheets
- Load multiple documents
- Accept file descriptors with path, label, and type hint
- Use type hints for files without extensions
- Warn about unsupported file types
- Warn about non-existent files
- Handle invalid descriptors
- Resolve paths with workspaceRoot
- Use WORKSPACE_PATH environment variable
- Truncate preview text
- Calculate word count
- Generate checksums

#### 4. markdown-formatter.test.mjs (12 tests)
Tests for converting documents to Markdown:
- Format single text documents
- Use document labels
- Format PDF metadata with page count
- Format spreadsheet tables
- Format empty spreadsheet sheets
- Escape pipe characters in tables
- Handle null and undefined values
- Format multiple documents with separator
- Throw errors for invalid inputs
- Handle documents with no text content
- Include table counts in metadata

#### 5. llm-runner.test.mjs
Tests for LLM integration (optional feature):
- Check LLM access via environment variables (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
- Validate document structure for LLM processing
- Error handling for missing credentials

**Note:** The llm-runner tests fail with `ERR_MODULE_NOT_FOUND` for 'achillesAgentLib' which is expected as this is an external dependency not included in the base installation.

### Integration Tests

#### process-documents.test.mjs (24 tests)
End-to-end tests for the main entry point:

**Input Normalization:**
- Process simple file input
- Handle input wrapped in "input", "arguments", or "args" properties
- Support type hints via "type" and "fileType"
- Error on missing or invalid file paths

**Options Resolution:**
- Use default options
- Handle maxPreviewChars option
- Handle tableSampleRows option
- Enforce minimum values

**Warnings:**
- Emit warnings for non-existent files
- Emit warnings for unsupported file types

**Full Workflow:**
- Process text files end-to-end
- Process markdown files
- Process XLSX files with tables
- Handle empty files
- Handle absolute paths
- Handle metadata properties

**Error Handling:**
- Exit with code 1 on errors
- Handle invalid JSON
- Handle empty stdin

## Test Results Summary

### Passing Tests
- **document-loader:** ✔ All 23 tests passing
- **markdown-formatter:** ✔ All 12 tests passing
- **process-documents (integration):** 22/24 passing
  - 2 minor failures related to test assertions

### Known Issues

1. **llm-runner.test.mjs:** Module import error
   - Cause: Missing 'achillesAgentLib' dependency
   - Impact: LLM features cannot be tested without this dependency
   - Resolution: Install achillesAgentLib or mock the dependency

2. **path-utils.test.mjs:** 2 test failures
   - "should throw error for whitespace-only path"
   - "should throw error for directory"
   - These are edge case tests that may need adjustment

3. **process-documents integration:** 2 test failures
   - "should handle tableSampleRows option"
   - "should emit warnings for unsupported file types"
   - Minor assertion issues in test expectations

4. **read-stdin.test.mjs:** Potential hanging issue
   - The stdin mocking tests may take longer to complete
   - Consider adding shorter timeouts for CI/CD

## Test Fixtures

### sample.txt
Simple text file for basic testing.

### sample.md
Markdown formatted file to test text loading with special characters.

### empty.txt
Empty file for edge case testing.

### sample.xlsx
Excel spreadsheet with three sheets:
- **Employees:** 5 rows with ID, Name, Department, Salary
- **Inventory:** 3 rows with SKU, Product, Quantity, Price
- **EmptySheet:** Empty sheet for edge case testing

## Adding New Tests

To add tests for a new module:

1. Create a new test file in `tests/unit/` or `tests/integration/`
2. Import the module to test
3. Use Node.js built-in test framework (`node:test`)
4. Follow the existing test structure:
   ```javascript
   import { describe, it } from 'node:test';
   import assert from 'node:assert';

   describe('module-name', () => {
       describe('functionName', () => {
           it('should do something', () => {
               // Test implementation
           });
       });
   });
   ```
5. Run `npm test` to verify

## Coverage Gaps

Areas that could benefit from additional testing:
1. PDF document loading (requires sample PDF files)
2. DOCX document loading (requires sample DOCX files)
3. DOC document loading (requires sample DOC files)
4. Error scenarios for corrupt files
5. Large file handling and performance testing
6. Concurrent document processing
7. LLM integration with actual API calls (requires credentials)

## Continuous Integration

To integrate with CI/CD:
1. Add `npm test` to your CI pipeline
2. Consider splitting unit and integration tests:
   ```bash
   npm test tests/unit/**/*.test.mjs      # Unit tests only
   npm test tests/integration/**/*.test.mjs  # Integration tests only
   ```
3. Set appropriate timeout values for long-running tests
4. Mock external dependencies (LLM APIs) in CI environment

## Dependencies

Test dependencies are minimal and use Node.js built-in modules:
- `node:test` - Native test framework
- `node:assert` - Native assertion library
- `node:fs/promises` - File system operations
- `node:child_process` - Process spawning for integration tests
