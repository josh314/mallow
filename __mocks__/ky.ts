// Manual mock for `ky`, which ships ESM-only and can't be `require`d by ts-jest/CJS.
// Jest applies mocks under a root-level __mocks__/ dir to node_modules packages
// automatically, so no per-test-file `jest.mock('ky')` call is needed.
const jsonMock = jest.fn();
const getMock  = jest.fn( () => ( { json: jsonMock } ) );

const ky = {
  get: getMock,
  create: jest.fn(),
};

ky.create.mockReturnValue( ky );

export default ky;
