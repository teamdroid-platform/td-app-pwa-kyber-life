const nextJest = require('next/jest')

const createJestConfig = nextJest({
    dir: './',
})

const customJestConfig = {
    globalSetup: '<rootDir>/jest.global-setup.js',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testEnvironment: 'jest-environment-jsdom',
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^uuid$': '<rootDir>/src/__mocks__/uuid.js',
    },
    testPathIgnorePatterns: ['<rootDir>/.agent/', '<rootDir>/.next/', '<rootDir>/scratch/'],
    modulePathIgnorePatterns: ['<rootDir>/.agent/', '<rootDir>/.next/', '<rootDir>/scratch/'],
}

module.exports = createJestConfig(customJestConfig)
