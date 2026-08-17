const nextJest = require('next/jest')

const createJestConfig = nextJest({
    dir: './',
})

/**
 * Config de unidad: entorno node, sin jsdom ni setup de Testing Library.
 * Corre los tests de dominio, servicios, validadores y lib — todo lo que no
 * renderiza componentes.
 *
 * Usa `next/jest` (SWC) igual que jest.config.js en vez de babel-jest. El
 * proyecto no tiene babel.config.js a propósito: tenerlo desactivaría el
 * compilador SWC de Next, así que la config vive aquí y no en la raíz.
 */
const customJestConfig = {
    testEnvironment: 'node',
    // Solo .ts: los .tsx renderizan componentes y necesitan jsdom (jest.config.js).
    testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^uuid$': '<rootDir>/src/__mocks__/uuid.js',
    },
    testPathIgnorePatterns: ['<rootDir>/.agent/', '<rootDir>/.next/', '<rootDir>/scratch/'],
    modulePathIgnorePatterns: ['<rootDir>/.agent/', '<rootDir>/.next/', '<rootDir>/scratch/'],
}

module.exports = createJestConfig(customJestConfig)
