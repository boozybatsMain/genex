import { nanoid } from "nanoid";

/**
 * A per-tab origin tag. Used to suppress echo loops when the server broadcasts
 * back changes that this tab itself just wrote.
 */
export const ORIGIN = `editor-${nanoid(6)}`;
