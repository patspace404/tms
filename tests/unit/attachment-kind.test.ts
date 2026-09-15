import { describe, expect, it } from "vitest";
import { isDocumentUrl, isVideoUrl } from "@/lib/attachment-kind";

describe("isVideoUrl", () => {
  it("recognises a Mac screen recording", () => {
    // The case that started this: .mov used to fall through to <img>.
    expect(isVideoUrl("/api/uploads/1757-Screen_Recording_2569-09-15.mov")).toBe(true);
  });

  it("recognises the other formats a run might carry", () => {
    for (const ext of ["mp4", "webm", "ogg", "ogv", "m4v", "avi", "mkv"]) {
      expect(isVideoUrl(`/api/uploads/clip.${ext}`)).toBe(true);
    }
  });

  it("is not fooled by case", () => {
    expect(isVideoUrl("/api/uploads/CLIP.MOV")).toBe(true);
  });

  it("leaves images alone", () => {
    expect(isVideoUrl("/api/uploads/shot.png")).toBe(false);
  });

  it("matches on the extension, not anywhere in the name", () => {
    expect(isVideoUrl("/api/uploads/mov-notes.png")).toBe(false);
  });

  it("handles a missing url", () => {
    expect(isVideoUrl(undefined)).toBe(false);
  });
});

describe("isDocumentUrl", () => {
  it("covers the log formats the upload button accepts", () => {
    for (const ext of ["txt", "log", "json", "har", "csv"]) {
      expect(isDocumentUrl(`/api/uploads/run.${ext}`)).toBe(true);
    }
  });

  it("does not claim video or images", () => {
    expect(isDocumentUrl("/api/uploads/clip.mov")).toBe(false);
    expect(isDocumentUrl("/api/uploads/shot.png")).toBe(false);
  });
});
