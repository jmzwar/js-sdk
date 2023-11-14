declare module "idna-uts46-hx" {
  export interface IToAsciiOptions {
    useStd3ASCII?: boolean;
    transitional?: boolean;
  }

  export const toAscii: (value: string, options?: IToAsciiOptions) => string;
}
