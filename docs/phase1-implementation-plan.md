# Phase 1 Implementation Plan: Project Setup and Foundation

## Overview
This document provides detailed implementation guidance for Phase 1 of the Container Converter project. It expands on the tasks defined in `.cursor/scratchpad.md` with specific technical decisions and configurations.

## Task 1: Initialize TypeScript/Node.js Project

### 1.1 Create package.json

**Project Metadata:**
```json
{
  "name": "container-converter",
  "version": "0.1.0",
  "description": "Convert Dockerfiles to Open Horizon Service Definition Files",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "container-converter": "dist/cli/index.js"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "build:dev": "tsc --sourceMap",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests --ext .ts",
    "lint:fix": "eslint src tests --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "typecheck:watch": "tsc --noEmit --watch",
    "validate": "npm run lint && npm run typecheck && npm test"
  },
  "keywords": [
    "docker",
    "dockerfile",
    "open-horizon",
    "edge-computing",
    "converter",
    "sdf"
  ],
  "author": "",
  "license": "Apache-2.0",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**Key Decisions:**
- **Node Version**: Require Node.js 18+ for modern features and LTS support
- **License**: Apache-2.0 (common for Open Horizon ecosystem)
- **Entry Points**: 
  - Library: `dist/index.js`
  - CLI: `dist/cli/index.js`
- **Build Tool**: TypeScript compiler (tsc)
- **Dev Tool**: tsx for hot reload during development

### 1.2 Configure TypeScript (tsconfig.json)

**Configuration:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "types": ["node", "jest"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Key Decisions:**
- **Target**: ES2022 for modern JavaScript features
- **Module**: CommonJS for Node.js compatibility
- **Strict Mode**: Enabled for type safety
- **Declaration Files**: Generated for library usage
- **Source Maps**: Enabled for debugging

### 1.3 Project Directory Structure

```
container-converter/
├── .cursor/
│   └── scratchpad.md
├── docs/
│   └── phase1-implementation-plan.md
├── examples/
│   └── sdf-examples/
├── src/
│   ├── cli/
│   │   └── index.ts
│   ├── parser/
│   │   └── dockerfile-parser.ts
│   ├── generator/
│   │   └── sdf-generator.ts
│   ├── validator/
│   │   └── sdf-validator.ts
│   ├── types/
│   │   ├── sdf.ts
│   │   └── dockerfile.ts
│   ├── utils/
│   │   └── errors.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   │   ├── parser/
│   │   ├── generator/
│   │   └── validator/
│   ├── integration/
│   └── fixtures/
│       ├── dockerfiles/
│       └── sdfs/
├── .eslintrc.json
├── .prettierrc.json
├── .gitignore
├── jest.config.js
├── package.json
├── tsconfig.json
├── AGENTS.md
└── README.md
```

**Key Decisions:**
- **src/**: Source code organized by responsibility
- **tests/**: Separate unit and integration tests
- **fixtures/**: Test data for Dockerfiles and SDFs
- **docs/**: Project documentation

### 1.4 Configure ESLint

**Configuration (.eslintrc.json):**
```json
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  },
  "env": {
    "node": true,
    "jest": true
  }
}
```

**Dependencies to Install:**
- `eslint`
- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`
- `eslint-config-prettier` (to avoid conflicts with Prettier)

### 1.5 Configure Prettier

**Configuration (.prettierrc.json):**
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always"
}
```

**Dependencies to Install:**
- `prettier`

### 1.6 Create .gitignore

**Content:**
```
# Dependencies
node_modules/
package-lock.json

# Build output
dist/
*.tsbuildinfo

# Test coverage
coverage/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Environment
.env
.env.local

# Temporary files
*.tmp
.cache/
```

### 1.7 Git Repository

**Actions:**
- Check if git is already initialized (`.git/` exists)
- If not, run `git init`
- Create initial commit with project structure

## Task 2: Set Up Testing Framework

### 2.1 Install Jest and TypeScript Support

**Dependencies:**
```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0"
  }
}
```

### 2.2 Configure Jest

**Configuration (jest.config.js):**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
```

**Key Decisions:**
- **Preset**: ts-jest for TypeScript support
- **Test Location**: `tests/` directory
- **Coverage Target**: 80% (will increase to 90% later)
- **Path Aliases**: Support `@/` for imports

### 2.3 Test Directory Structure

```
tests/
├── unit/
│   ├── parser/
│   │   └── dockerfile-parser.test.ts
│   ├── generator/
│   │   └── sdf-generator.test.ts
│   └── validator/
│       └── sdf-validator.test.ts
├── integration/
│   └── converter.test.ts
└── fixtures/
    ├── dockerfiles/
    │   ├── simple.Dockerfile
    │   └── complex.Dockerfile
    └── sdfs/
        ├── simple.json
        └── complex.json
```

### 2.4 Sample Test

**File: tests/unit/utils/sample.test.ts**
```typescript
describe('Sample Test Suite', () => {
  it('should verify Jest is working', () => {
    expect(true).toBe(true);
  });

  it('should perform basic arithmetic', () => {
    const sum = 2 + 2;
    expect(sum).toBe(4);
  });
});
```

**Verification:**
- Run `npm test` to ensure Jest executes successfully
- Verify coverage report generation with `npm run test:coverage`

## Task 3: Install Core Dependencies

### 3.1 Research Dockerfile Parser Libraries

**Options:**
1. **dockerfile-ast** (Microsoft)
   - Pros: Official, well-maintained, comprehensive AST
   - Cons: Verbose API
   - GitHub: https://github.com/rcjsuen/dockerfile-ast

2. **dockerode** 
   - Pros: Full Docker API integration
   - Cons: Overkill for parsing only, requires Docker daemon

3. **dockerfile-parser**
   - Pros: Simple API
   - Cons: Less maintained, limited features

**Recommendation**: Use `dockerfile-ast` for comprehensive parsing capabilities

### 3.2 Install Dependencies

**Production Dependencies:**
```json
{
  "dependencies": {
    "dockerfile-ast": "^0.6.1",
    "commander": "^11.1.0"
  }
}
```

**Development Dependencies:**
```json
{
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "tsx": "^4.7.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/parser": "^6.18.0",
    "@typescript-eslint/eslint-plugin": "^6.18.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.1.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0"
  }
}
```

**Key Dependencies:**
- **dockerfile-ast**: Dockerfile parsing
- **commander**: CLI argument parsing
- **tsx**: TypeScript execution for development
- **typescript**: TypeScript compiler
- **jest/ts-jest**: Testing framework

### 3.3 Verify Installation

**Verification Steps:**
1. Run `npm install` to install all dependencies
2. Run `npm run typecheck` to verify TypeScript setup
3. Run `npm test` to verify Jest setup
4. Run `npm run lint` to verify ESLint setup
5. Run `npm run format` to verify Prettier setup

## Success Criteria Checklist

### Task 1: Initialize TypeScript/Node.js Project
- [ ] `package.json` created with all required scripts
- [ ] `tsconfig.json` configured with strict mode
- [ ] Project directory structure created
- [ ] ESLint configured and working
- [ ] Prettier configured and working
- [ ] `.gitignore` created
- [ ] Git repository initialized (if needed)

### Task 2: Set Up Testing Framework
- [ ] Jest installed and configured
- [ ] Test directory structure created
- [ ] Sample test passes successfully
- [ ] Coverage reporting works

### Task 3: Install Core Dependencies
- [ ] `dockerfile-ast` installed
- [ ] All type definitions available
- [ ] Dependencies documented in `package.json`
- [ ] All verification steps pass

## Next Steps

After completing Phase 1:
1. Update `.cursor/scratchpad.md` to mark Tasks 1-3 as complete
2. Commit all changes to git
3. Proceed to Phase 2: Dockerfile Parsing

## Notes

- All configurations follow the guidelines in `AGENTS.md`
- TypeScript strict mode is enabled for maximum type safety
- Test coverage threshold set to 80% initially (will increase to 90%)
- Project uses CommonJS modules for Node.js compatibility
- CLI tool will be available as `container-converter` command