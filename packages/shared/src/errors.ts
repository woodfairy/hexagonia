export type ErrorParamValue = string | number | boolean;

export type ErrorParams = Record<string, ErrorParamValue>;

export interface ErrorDescriptor {
  errorCode: string;
  errorParams?: ErrorParams;
}
