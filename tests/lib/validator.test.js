import { describe, expect, it } from "bun:test";
import { validateCVInput } from "../../lib/validator.js";

describe("CV Validator", () => {
  it("should validate a correct minimal payload", () => {
    const input = {
      personal: {
        name: "Dimas Febriyanto",
        email: "dimas@example.com"
      }
    };
    const { data, errors } = validateCVInput(input);
    expect(errors).toBeNull();
    expect(data.personal.name).toBe("Dimas Febriyanto");
  });

  it("should return error if personal.name is missing", () => {
    const input = {
      personal: {
        email: "dimas@example.com"
      }
    };
    const { errors } = validateCVInput(input);
    expect(errors).not.toBeNull();
    expect(errors[0].path).toBe("personal.name");
  });

  it("should allow and preserve extra fields (passthrough)", () => {
    const input = {
      personal: { name: "Dimas" },
      extra_field: "some value"
    };
    const { data } = validateCVInput(input);
    expect(data.extra_field).toBe("some value");
  });

  it("should handle invalid email format", () => {
    const input = {
      personal: { 
        name: "Dimas",
        email: "not-an-email" 
      }
    };
    const { errors } = validateCVInput(input);
    expect(errors).not.toBeNull();
    expect(errors[0].path).toBe("personal.email");
  });

  // ── Boundary Tests ──
  it("should allow empty strings for optional fields", () => {
    const input = {
      personal: { name: "Dimas", phone: "" },
      summary: ""
    };
    const { data, errors } = validateCVInput(input);
    expect(errors).toBeNull();
    expect(data.personal.phone).toBe("");
    expect(data.summary).toBe("");
  });

  it("should handle extremely long strings", () => {
    const longString = "A".repeat(10000);
    const input = {
      personal: { name: "Dimas" },
      summary: longString
    };
    const { data, errors } = validateCVInput(input);
    expect(errors).toBeNull();
    expect(data.summary.length).toBe(10000);
  });

  // ── Edge Case Tests ──
  it("should reject wrong data types (e.g., array instead of string)", () => {
    const input = {
      personal: { name: ["Not", "a", "string"] }
    };
    const { errors } = validateCVInput(input);
    expect(errors).not.toBeNull();
    expect(errors[0].path).toBe("personal.name");
  });

  it("should allow and preserve unknown fields (passthrough)", () => {
    const input = {
      personal: { name: "Dimas" },
      unknown_field: 123,
      nested: { secret: "data" }
    };
    const { data, errors } = validateCVInput(input);
    expect(errors).toBeNull();
    expect(data.unknown_field).toBe(123);
    expect(data.nested.secret).toBe("data");
  });

  it("should validate a full payload with all sub-schemas", () => {
    const input = {
      personal: { name: "Dimas", email: "d@e.com" },
      summary: "Sum",
      experience: [{ title: "T", company: "C", bullets: ["b1"] }],
      education: [{ degree: "D", institution: "I" }],
      projects: [{ name: "P", technologies: ["T1"], bullets: ["b1"] }],
      skills: [{ name: "S", items: ["i1"] }],
      certifications: [{ name: "C1", issuer: "I1" }],
      custom_sections: [{ id: "c1", title: "Ct", bullets: ["cb1"] }]
    };
    const { data, errors } = validateCVInput(input);
    expect(errors).toBeNull();
    expect(data.experience.length).toBe(1);
    expect(data.projects[0].technologies).toEqual(["T1"]);
  });

  it("should apply default values to optional arrays when omitted", () => {
    const input = {
      personal: { name: "Dimas" },
      experience: [{ company: "C" }]
    };
    const { data } = validateCVInput(input);
    expect(data.experience[0].bullets).toEqual([]);
    expect(data.skills).toEqual([]);
    expect(data.projects).toEqual([]);
  });

  it("should return error if personal object is missing entirely", () => {
    const input = { summary: "hello" };
    const { errors } = validateCVInput(input);
    expect(errors).not.toBeNull();
    expect(errors[0].path).toBe("personal");
  });

  it("should return error if custom_sections missing required fields", () => {
    const input = {
      personal: { name: "Dimas" },
      custom_sections: [{ bullets: ["a"] }] // Missing id and title
    };
    const { errors } = validateCVInput(input);
    expect(errors).not.toBeNull();
    const paths = errors.map(e => e.path);
    expect(paths).toContain("custom_sections.0.id");
    expect(paths).toContain("custom_sections.0.title");
  });

  it("should validate personal.name with exactly 1 character", () => {
    const input = { personal: { name: "A" } };
    const { errors } = validateCVInput(input);
    expect(errors).toBeNull();
  });

  it("should reject explicit null for personal.name", () => {
    const input = { personal: { name: null } };
    const { errors } = validateCVInput(input);
    expect(errors).not.toBeNull();
    expect(errors[0].path).toBe("personal.name");
  });

  it("should reject array containing non-objects for experience", () => {
    const input = {
      personal: { name: "X" },
      experience: ["not an object"]
    };
    const { errors } = validateCVInput(input);
    expect(errors).not.toBeNull();
    expect(errors[0].path).toBe("experience.0");
  });

  it("should handle negative numbers in year fields (schema allows for now, but good to test)", () => {
    const input = {
      personal: { name: "X" },
      education: [{ degree: "D", institution: "I", graduation_year: "-1" }]
    };
    const { errors } = validateCVInput(input);
    expect(errors).toBeNull(); 
  });

  it("should reject dangerous URL protocols (javascript:)", () => {
    const input = {
      personal: { name: "X" },
      projects: [{ name: "P", link: "javascript:alert(1)" }]
    };
    const { errors } = validateCVInput(input);
    expect(errors).not.toBeNull();
    expect(errors[0].message).toBe("Invalid URL protocol");
  });

  it("should reject duplicate IDs in custom_sections", () => {
    const input = {
      personal: { name: "X" },
      custom_sections: [
        { id: "sec1", title: "Title 1", bullets: [] },
        { id: "sec1", title: "Title 2", bullets: [] }
      ]
    };
    const { errors } = validateCVInput(input);
    expect(errors).not.toBeNull();
    expect(errors[0].message).toBe("Custom section IDs must be unique");
  });
});
