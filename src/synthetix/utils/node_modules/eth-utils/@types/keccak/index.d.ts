declare module "keccak" {
  import { Hash } from "crypto";

  type Types = "keccak256" | "keccak512";
  const keccak: (type: Types) => Hash;

  export = keccak;
}
