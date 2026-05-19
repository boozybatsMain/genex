import { transform } from "sucrase";

export function stripTs(src: string): string {
  return transform(src, {
    transforms: ["typescript"],
    disableESTransforms: true,
  }).code;
}
