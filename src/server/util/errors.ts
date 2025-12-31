import type { FlattenedZodError } from '@types';

export abstract class AppError extends Error {

  public readonly expose: boolean = false;

  protected constructor( message: string ) {
    super( message );
    this.name = this.constructor.name;
    Error.captureStackTrace?.( this, this.constructor );
  }
}

export class ConfigurationError extends Error {

  public readonly flattened: FlattenedZodError;

  constructor( flattened: FlattenedZodError ) {

    super( 'Configuration validation error' );
    this.flattened = flattened;

  }
}