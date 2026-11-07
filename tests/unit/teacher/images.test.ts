import { describe, expect, test } from "vitest";
import { checkImage, downscaleImage, IMAGE_ACCEPT, IMAGE_MAX_BYTES, scaledSize, UnreadableImage, type ImageEnv } from "@/lib/teacher/images";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("which pictures may be added", () => {
  test("JPEG, PNG and WebP are, by their type", () => {
    for (const [name, type] of [["a.jpg", "image/jpeg"], ["a.png", "image/png"], ["a.webp", "image/webp"]]) expect(checkImage(file(name, type))).toBeNull();
  });

  test("the type counts, not the name: a picture named .pdf is a picture, a PDF named .png is not", () => {
    expect(checkImage(file("x.pdf", "image/png"))).toBeNull();
    expect(checkImage(file("x.png", "application/pdf"))).toBe("image_type");
  });

  test("a system that gives no type is judged by the ending of the name, in any case", () => {
    expect(checkImage(file("FOTO.JPG", ""))).toBeNull();
    expect(checkImage(file("foto.jpeg", ""))).toBeNull();
    expect(checkImage(file("foto.Webp", ""))).toBeNull();
    expect(checkImage(file("foto.gif", ""))).toBe("image_type");
    expect(checkImage(file("foto", ""))).toBe("image_type");
  });

  test("other pictures are not: GIF, SVG, HEIC, TIFF", () => {
    for (const type of ["image/gif", "image/svg+xml", "image/heic", "image/tiff", "text/plain", "video/mp4"]) expect(checkImage(file("x.jpg", type))).toBe("image_type");
  });

  test("the most is 10 MB: that is allowed, one byte more is not", () => {
    expect(IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(checkImage(file("a.jpg", "image/jpeg", IMAGE_MAX_BYTES))).toBeNull();
    expect(checkImage(file("a.jpg", "image/jpeg", IMAGE_MAX_BYTES + 1))).toBe("image_too_large");
  });

  test("an empty file is not a picture, and a wrong type is said before a size", () => {
    expect(checkImage(file("a.jpg", "image/jpeg", 0))).toBe("image_unreadable");
    expect(checkImage(file("a.gif", "image/gif", IMAGE_MAX_BYTES + 1))).toBe("image_type");
  });

  test("the file field offers the three types and their endings", () => {
    expect(IMAGE_ACCEPT.split(",")).toEqual(["image/jpeg", "image/png", "image/webp", ".jpg", ".jpeg", ".png", ".webp"]);
  });
});

describe("making a picture small", () => {
  test("the longest side is brought to 1000, the shape kept", () => {
    expect(scaledSize(4000, 3000, 1000)).toEqual({ width: 1000, height: 750 });
    expect(scaledSize(3000, 4000, 1000)).toEqual({ width: 750, height: 1000 });
    expect(scaledSize(1500, 1500, 1000)).toEqual({ width: 1000, height: 1000 });
  });

  test("a picture that is small enough is not made larger", () => {
    expect(scaledSize(800, 600, 1000)).toEqual({ width: 800, height: 600 });
    expect(scaledSize(1000, 10, 1000)).toEqual({ width: 1000, height: 10 });
  });

  test("a very thin picture keeps at least one pixel", () => {
    expect(scaledSize(10000, 3, 1000)).toEqual({ width: 1000, height: 1 });
  });

  /** A browser that sees a picture of the size it is given, and draws what it is told. */
  const env = (size: { width: number; height: number }, drawn: unknown[] = []): ImageEnv => ({
    decode: async () => ({ ...size, source: "bitmap" }),
    encode: async (source, width, height, quality) => {
      drawn.push({ source, width, height, quality });
      return "data:image/jpeg;base64,AAAA";
    },
  });

  test("a large photo is drawn at about 1000 pixels as a JPEG of good quality", async () => {
    const drawn: unknown[] = [];
    const out = await downscaleImage(new Blob(["x"]), env({ width: 4032, height: 3024 }, drawn));
    expect(out).toEqual({ url: "data:image/jpeg;base64,AAAA", width: 1000, height: 750 });
    expect(drawn).toEqual([{ source: "bitmap", width: 1000, height: 750, quality: 0.8 }]);
  });

  test("a small picture keeps its size", async () => {
    const out = await downscaleImage(new Blob(["x"]), env({ width: 640, height: 480 }));
    expect(out).toMatchObject({ width: 640, height: 480 });
  });

  test("another size and quality can be asked for", async () => {
    const drawn: unknown[] = [];
    await downscaleImage(new Blob(["x"]), env({ width: 2000, height: 1000 }, drawn), { edge: 500, quality: 0.5 });
    expect(drawn).toEqual([{ source: "bitmap", width: 500, height: 250, quality: 0.5 }]);
  });

  test("a file the browser cannot read, or that has no size, is an unreadable picture", async () => {
    const broken: ImageEnv = { decode: async () => Promise.reject(new Error("not an image")), encode: async () => "" };
    await expect(downscaleImage(new Blob(["x"]), broken)).rejects.toBeInstanceOf(UnreadableImage);
    await expect(downscaleImage(new Blob(["x"]), env({ width: 0, height: 0 }))).rejects.toBeInstanceOf(UnreadableImage);
    const cannotDraw: ImageEnv = { decode: async () => ({ width: 10, height: 10, source: 1 }), encode: async () => Promise.reject(new Error("no canvas")) };
    await expect(downscaleImage(new Blob(["x"]), cannotDraw)).rejects.toBeInstanceOf(UnreadableImage);
  });
});
