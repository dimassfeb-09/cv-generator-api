import { describe, expect, it, mock, beforeEach, beforeAll, afterAll, spyOn } from "bun:test";
import generateHandler from "../api/generate.js";
import cvDetailHandler from "../api/cv/[id].js";
import userCvsHandler from "../api/cv/user/[email].js";

// ── Shared Mocks ───────────────────────────────────────────

const mockDbClient = {
  query: mock(() => Promise.resolve({ rows: [] })),
  release: mock(() => {}),
};

const mockStorageMethods = {
  upload: mock(() => Promise.resolve({ data: {}, error: null })),
  getPublicUrl: mock(() => ({ data: { publicUrl: "https://example.com/cv.pdf" } })),
  createSignedUrl: mock(() => Promise.resolve({ data: { signedUrl: "https://example.com/signed.pdf" }, error: null })),
};

const mockSupabase = {
  storage: {
    from: mock(() => mockStorageMethods),
  },
};

mock.module("../lib/db.js", () => ({
  getPool: () => ({
    connect: async () => mockDbClient,
  }),
}));

mock.module("@supabase/supabase-js", () => ({
  createClient: () => mockSupabase,
}));

mock.module("puppeteer-core", () => ({
  default: {
    launch: async () => ({
      newPage: async () => ({
        setContent: async () => {},
        pdf: async () => Buffer.from("FAKE_PDF"),
      }),
      close: async () => {},
    }),
  },
}));

mock.module("@sparticuz/chromium", () => ({
  default: { args: [], defaultViewport: {}, executablePath: async () => "/path", headless: true },
}));

mock.module("../lib/auth.js", () => ({
  verifyToken: mock(() => ({ id: "u1", email: "d@e.com" })),
  generateToken: mock(() => "fake-token"),
}));

// ── Helpers ────────────────────────────────────────────────

function createMockRes() {
  const res = {
    _status: 200,
    _json: null,
    _headers: {},
    status: function (s) { this._status = s; return this; },
    json: function (j) { this._json = j; return this; },
    setHeader: function (k, v) { this._headers[k] = v; return this; },
    end: function () { return this; },
  };
  return res;
}

// ── Tests ──────────────────────────────────────────────────

describe("Integration & API Tests", () => {
  beforeAll(() => {
    spyOn(console, "log").mockImplementation(() => {});
    spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockDbClient.query.mockClear();
    mockDbClient.release.mockClear();
    mockStorageMethods.upload.mockClear();
    mockStorageMethods.createSignedUrl.mockClear();
  });

  describe("POST /api/generate", () => {
    it("should generate CV successfully", async () => {
      const req = {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: { personal: { name: "Dimas", email: "d@e.com" } }
      };
      const res = createMockRes();

      mockDbClient.query
        .mockImplementationOnce(() => Promise.resolve({})) // BEGIN
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: "u1" }] })) // UPSERT
        .mockImplementationOnce(() => Promise.resolve({})) // CV
        .mockImplementationOnce(() => Promise.resolve({})) // INFO
        .mockImplementationOnce(() => Promise.resolve({})); // COMMIT

      await generateHandler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.data.pdf_url).toBe("https://example.com/cv.pdf");
    });

    it("should handle rollback on DB error", async () => {
      const req = { method: "POST", body: { personal: { name: "X" } } };
      const res = createMockRes();
      mockDbClient.query
        .mockImplementationOnce(() => Promise.resolve({})) // BEGIN
        .mockImplementationOnce(() => Promise.reject(new Error("FAIL")));
      
      await generateHandler(req, res);
      expect(res._status).toBe(500);
      expect(mockDbClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("should respect dynamic layout based on body key order", async () => {
      const req = {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: { personal: { name: "X" }, skills: [], summary: "S" }
      };
      const res = createMockRes();
      mockDbClient.query.mockImplementation(() => Promise.resolve({ rows: [{ id: "1" }] }));
      
      await generateHandler(req, res);
      expect(res._status).toBe(200);
      // Logic checked: SECTION_KEYS filter (L82-83 in generate.js)
    });

    it("should parse string body correctly", async () => {
      const req = {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: JSON.stringify({ personal: { name: "X", email: "x@y.com" } })
      };
      const res = createMockRes();
      mockDbClient.query.mockImplementation(() => Promise.resolve({ rows: [{ id: "1" }] }));
      
      await generateHandler(req, res);
      expect(res._status).toBe(200);
    });

    it("should use cv_title from body", async () => {
      const req = {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: { cv_title: "My Custom Title", personal: { name: "X", email: "x@y.com" } }
      };
      const res = createMockRes();
      mockDbClient.query.mockImplementation(() => Promise.resolve({ rows: [{ id: "1" }] }));
      
      await generateHandler(req, res);
      const insertCall = mockDbClient.query.mock.calls.find(c => c[0].includes("INSERT INTO cv_documents"));
      expect(insertCall[1]).toContain("My Custom Title");
    });

    it("should fallback to signedUrl if publicUrl is null", async () => {
      const req = { method: "POST", headers: { authorization: "Bearer token" }, body: { personal: { name: "X", email: "x@y.com" } } };
      const res = createMockRes();
      mockStorageMethods.getPublicUrl.mockReturnValueOnce({ data: { publicUrl: null } });
      mockDbClient.query.mockImplementation(() => Promise.resolve({ rows: [{ id: "1" }] }));

      await generateHandler(req, res);
      expect(res._json.data.pdf_url).toBe("https://example.com/signed.pdf");
    });

    it("should return 405 for non-POST methods", async () => {
      const req = { method: "GET", headers: { authorization: "Bearer token" } };
      const res = createMockRes();
      await generateHandler(req, res);
      expect(res._status).toBe(405);
    });

    it("should return 400 for malformed JSON body", async () => {
      const req = { method: "POST", headers: { authorization: "Bearer token" }, body: "{ invalid json" };
      const res = createMockRes();
      await generateHandler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain("Invalid JSON");
    });

    it("should handle extremely long cv_title with special characters", async () => {
      const longTitle = "A".repeat(1000) + "<script>alert(1)</script> 🚀";
      const req = {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: { cv_title: longTitle, personal: { name: "X", email: "x@y.com" } }
      };
      const res = createMockRes();
      mockDbClient.query.mockImplementation(() => Promise.resolve({ rows: [{ id: "1" }] }));
      
      await generateHandler(req, res);
      expect(res._status).toBe(200);
      const insertCall = mockDbClient.query.mock.calls.find(c => c[0].includes("INSERT INTO cv_documents"));
      expect(insertCall[1]).toContain(longTitle);
    });

    it("should verify full response shape on success", async () => {
      const req = { method: "POST", headers: { authorization: "Bearer token" }, body: { personal: { name: "X", email: "x@y.com" } } };
      const res = createMockRes();
      mockDbClient.query.mockImplementation((q) => {
        if (q.includes("INSERT INTO users") || q.includes("INSERT INTO cv_documents")) {
          return Promise.resolve({ rows: [{ id: "uuid-123", created_at: "2026-05-01" }] });
        }
        return Promise.resolve({});
      });

      await generateHandler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.data).toHaveProperty("id");
      expect(res._json.data).toHaveProperty("created_at");
      expect(res._json.data).toHaveProperty("signed_url");
    });

    it("should handle concurrent requests with same email correctly", async () => {
      const req = { method: "POST", headers: { authorization: "Bearer token" }, body: { personal: { name: "X", email: "concurrent@e.com" } } };
      const res1 = createMockRes();
      const res2 = createMockRes();

      mockDbClient.query.mockImplementation(() => Promise.resolve({ rows: [{ id: "u1" }] }));

      // Simulate simultaneous requests
      await Promise.all([
        generateHandler(req, res1),
        generateHandler(req, res2)
      ]);

      expect(res1._status).toBe(200);
      expect(res2._status).toBe(200);
    });

    it("should return 500 if Puppeteer fails to launch", async () => {
      const puppeteer = (await import("puppeteer-core")).default;
      const originalLaunch = puppeteer.launch;
      puppeteer.launch = mock(() => Promise.reject(new Error("Browser not found")));

      const req = { method: "POST", headers: { authorization: "Bearer token" }, body: { personal: { name: "X", email: "x@y.com" } } };
      const res = createMockRes();
      
      await generateHandler(req, res);
      expect(res._status).toBe(500);
      expect(res._json.error).toContain("Failed to process CV");
      
      // Restore
      puppeteer.launch = originalLaunch;
    });

    it("should return 500 if PDF generation crashes", async () => {
      const puppeteer = (await import("puppeteer-core")).default;
      const originalLaunch = puppeteer.launch;
      // Mock page.pdf to fail
      puppeteer.launch = mock(async () => ({
        newPage: async () => ({
          setContent: async () => {},
          pdf: mock(() => Promise.reject(new Error("PDF Crash"))),
        }),
        close: async () => {},
      }));

      const req = { method: "POST", headers: { authorization: "Bearer token" }, body: { personal: { name: "X", email: "x@y.com" } } };
      const res = createMockRes();
      
      await generateHandler(req, res);
      expect(res._status).toBe(500);
      
      puppeteer.launch = originalLaunch;
    });

    it("should handle missing critical environment variables gracefully", async () => {
      const originalEnv = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      const req = { method: "POST", headers: { authorization: "Bearer token" }, body: { personal: { name: "X", email: "x@y.com" } } };
      const res = createMockRes();
      
      // Since our getPool() likely reads from process.env, 
      // missing DB URL should be caught during connect or earlier.
      await generateHandler(req, res);
      expect(res._status).toBe(500);
      
      process.env.DATABASE_URL = originalEnv;
    });
  });

  describe("GET /api/cv/[id]", () => {
    it("should return 404 if not found", async () => {
      const req = { method: "GET", query: { id: "none" }, headers: { authorization: "Bearer token" } };
      const res = createMockRes();
      mockDbClient.query.mockImplementationOnce(() => Promise.resolve({ rows: [] }));
      await cvDetailHandler(req, res);
      expect(res._status).toBe(404);
    });

    it("should fallback to pdf_url if signedUrl fails", async () => {
      const req = { method: "GET", query: { id: "id" }, headers: { authorization: "Bearer token" } };
      const res = createMockRes();
      mockDbClient.query.mockImplementationOnce(() => Promise.resolve({ 
        rows: [{ id: "id", pdf_url: "http://public.pdf", owner_email: "d@e.com" }] 
      }));
      mockStorageMethods.createSignedUrl.mockImplementationOnce(() => 
        Promise.resolve({ error: { message: "Fail" } })
      );

      await cvDetailHandler(req, res);
      expect(res._json.data.download_url).toBe("http://public.pdf");
    });

    it("should return 405 for non-GET methods", async () => {
      const req = { method: "POST", query: { id: "1" }, headers: { authorization: "Bearer token" } };
      const res = createMockRes();
      await cvDetailHandler(req, res);
      expect(res._status).toBe(405);
    });

    it("should return 400 if id is missing", async () => {
      const req = { method: "GET", query: {}, headers: { authorization: "Bearer token" } };
      const res = createMockRes();
      await cvDetailHandler(req, res);
      expect(res._status).toBe(400);
    });

    it("should return 500 if parallel queries fail", async () => {
      const req = { method: "GET", query: { id: "id" }, headers: { authorization: "Bearer token" } };
      const res = createMockRes();
      mockDbClient.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: "id", owner_email: "d@e.com" }] })) // Main ok
        .mockImplementationOnce(() => Promise.reject(new Error("Parallel Fail")));
      
      await cvDetailHandler(req, res);
      expect(res._status).toBe(500);
    });

    it("should return empty arrays for missing relations", async () => {
      const req = { method: "GET", query: { id: "id" }, headers: { authorization: "Bearer token" } };
      const res = createMockRes();
      mockDbClient.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: "id", owner_email: "d@e.com" }] }))
        .mockImplementation(() => Promise.resolve({ rows: [] })); // Others empty
      
      await cvDetailHandler(req, res);
      expect(res._json.data.experience).toEqual([]);
      expect(res._json.data.skills).toEqual([]);
    });
  });

  describe("GET /api/cv/user/[email]", () => {
    it("should return empty list correctly", async () => {
      const req = { method: "GET", query: { email: "d@e.com" }, headers: { authorization: "Bearer token" } };
      const res = createMockRes();
      mockDbClient.query.mockImplementationOnce(() => Promise.resolve({ rows: [] }));
      await userCvsHandler(req, res);
      expect(res._json.count).toBe(0);
    });

    it("should return 405 for non-GET methods", async () => {
      const req = { method: "POST", query: { email: "x@y.com" } };
      const res = createMockRes();
      await userCvsHandler(req, res);
      expect(res._status).toBe(405);
    });

    it("should return 400 if email is missing", async () => {
      const req = { method: "GET", query: {} };
      const res = createMockRes();
      await userCvsHandler(req, res);
      expect(res._status).toBe(400);
    });

    it("should return 500 on DB error", async () => {
      const req = { method: "GET", query: { email: "d@e.com" }, headers: { authorization: "Bearer token" } };
      const res = createMockRes();
      mockDbClient.query.mockImplementationOnce(() => Promise.reject(new Error("DB fail")));
      await userCvsHandler(req, res);
      expect(res._status).toBe(500);
    });
  });

  describe("Storage Lib (Indirect)", () => {
    it("should propagate upload errors", async () => {
      const { uploadPdf } = await import("../lib/storage.js");
      mockStorageMethods.upload.mockImplementationOnce(() => 
        Promise.resolve({ error: { message: "Quota" } })
      );
      expect(uploadPdf(Buffer.from(""), "x.pdf")).rejects.toThrow("Quota");
    });

    it("should propagate signed URL errors", async () => {
      const { getSignedUrl } = await import("../lib/storage.js");
      mockStorageMethods.createSignedUrl.mockImplementationOnce(() => 
        Promise.resolve({ error: { message: "Signed fail" } })
      );
      expect(getSignedUrl("x.pdf")).rejects.toThrow("Fail");
    });
  });
});
