import { describe, expect, it, beforeAll } from "bun:test";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";

describe("CV Template Rendering", () => {
  let compiledTemplate;

  beforeAll(() => {
    // Setup Handlebars helpers exactly as in api/generate.js
    Handlebars.registerHelper("join", (arr, separator) => {
      if (!Array.isArray(arr)) return "";
      return arr.join(separator);
    });
    Handlebars.registerHelper("eq", (a, b) => a === b);

    const templatePath = path.resolve(import.meta.dir, "../../templates/cv.hbs");
    const templateSource = fs.readFileSync(templatePath, "utf-8");
    compiledTemplate = Handlebars.compile(templateSource);
  });

  it("should render sections in the order specified by layout", () => {
    const data = {
      personal: { name: "Test User" },
      layout: ["summary", "experience"],
      summary: "MY_SUMMARY_TEXT",
      experience: [{ company: "COMPANY_A", title: "Role A" }]
    };

    const html = compiledTemplate(data);
    
    // Check if summary comes before experience
    const summaryPos = html.indexOf("Professional Summary");
    const experiencePos = html.indexOf("Work Experience");
    
    expect(summaryPos).toBeGreaterThan(-1);
    expect(experiencePos).toBeGreaterThan(-1);
    expect(summaryPos).toBeLessThan(experiencePos);
  });

  it("should reverse section order if layout is reversed", () => {
    const data = {
      personal: { name: "Test User" },
      layout: ["experience", "summary"],
      summary: "MY_SUMMARY_TEXT",
      experience: [{ company: "COMPANY_A", title: "Role A" }]
    };

    const html = compiledTemplate(data);
    
    const summaryPos = html.indexOf("Professional Summary");
    const experiencePos = html.indexOf("Work Experience");
    
    expect(experiencePos).toBeLessThan(summaryPos);
  });

  it("should render all custom sections when 'custom_sections' key is hit", () => {
    const data = {
      personal: { name: "Test User" },
      layout: ["custom_sections"],
      custom_sections: [
        { title: "AWARD_1", content: "desc 1" },
        { title: "AWARD_2", content: "desc 2" }
      ]
    };

    const html = compiledTemplate(data);
    
    expect(html).toContain("AWARD_1");
    expect(html).toContain("AWARD_2");
  });

  // ── Negative Tests ──
  it("should not crash when optional data context is missing", () => {
    const data = {
      personal: { name: "Test User" },
      layout: ["summary", "experience"]
      // summary and experience are missing
    };

    const html = compiledTemplate(data);
    expect(html).toContain("Test User");
    expect(html).not.toContain("Professional Summary");
    expect(html).not.toContain("Work Experience");
  });

  // ── Boundary Tests ──
  it("should not render section titles for empty arrays", () => {
    const data = {
      personal: { name: "Test User" },
      layout: ["experience", "skills"],
      experience: [], // Empty array
      skills: [] // Empty array
    };

    const html = compiledTemplate(data);
    expect(html).not.toContain("Work Experience");
    expect(html).not.toContain("Skills");
  });

  // ── Edge Case Tests ──
  it("should escape HTML tags in user input (XSS protection)", () => {
    const data = {
      personal: { name: "<b>Dimas</b>" },
      layout: ["summary"],
      summary: "<script>alert(1)</script>"
    };

    const html = compiledTemplate(data);
    expect(html).toContain("&lt;b&gt;Dimas&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<b>Dimas</b>");
  });

  it("should render projects with technologies and link", () => {
    const data = {
      personal: { name: "X" },
      layout: ["projects"],
      projects: [{ name: "App", technologies: ["Go", "Flutter"], link: "https://example.com" }]
    };
    const html = compiledTemplate(data);
    expect(html).toContain("<strong>Technologies:</strong> Go, Flutter");
    expect(html).toContain('href="https://example.com"');
  });

  it("should render certifications with issuer and year", () => {
    const data = {
      personal: { name: "X" },
      layout: ["certifications"],
      certifications: [{ name: "AWS", issuer: "Amazon", year: "2024" }]
    };
    const html = compiledTemplate(data);
    expect(html).toContain("AWS");
    expect(html).toContain("Amazon");
    expect(html).toContain("(2024)");
  });

  it("should render education with conditional date", () => {
    const dataWithStart = {
      personal: { name: "X" },
      layout: ["education"],
      education: [{ degree: "D", institution: "I", start_date: "2021", graduation_year: "2025" }]
    };
    const htmlWithStart = compiledTemplate(dataWithStart);
    expect(htmlWithStart).toContain("2021 – 2025");

    const dataNoStart = {
      personal: { name: "X" },
      layout: ["education"],
      education: [{ degree: "D", institution: "I", graduation_year: "2025" }]
    };
    const htmlNoStart = compiledTemplate(dataNoStart);
    expect(htmlNoStart).toContain("2025");
    expect(htmlNoStart).not.toContain("– 2025");
  });

  it("should conditionally render contact info fields", () => {
    const data = {
      personal: { name: "X", phone: "123", email: "a@b.com" }
    };
    const html = compiledTemplate(data);
    expect(html).toContain("123");
    expect(html).toContain("a@b.com");
    expect(html).not.toContain("LinkedIn");
  });

  it("should render custom section with content paragraph", () => {
    const data = {
      personal: { name: "X" },
      layout: ["custom_sections"],
      custom_sections: [{ title: "About", content: "Some paragraph" }]
    };
    const html = compiledTemplate(data);
    expect(html).toContain("<p>Some paragraph</p>");
    expect(html).not.toContain("<ul>");
  });

  it("should handle non-array input in join helper gracefully", () => {
    const data = {
      personal: { name: "X" },
      layout: ["skills"],
      skills: [{ name: "Languages", items: "not-an-array" }]
    };
    const html = compiledTemplate(data);
    expect(html).toContain("Languages");
    // Should render without crashing, items will be empty string
  });

  it("should handle experience with all fields as empty strings", () => {
    const data = {
      personal: { name: "X" },
      layout: ["experience"],
      experience: [{ title: "", company: "", bullets: [""] }]
    };
    const html = compiledTemplate(data);
    expect(html).toContain("Experience"); // Section title still appears
    // Just verify it doesn't crash and renders some structure
  });

  it("should handle skills with array of empty strings", () => {
    const data = {
      personal: { name: "X" },
      layout: ["skills"],
      skills: [{ name: "S", items: ["", ""] }]
    };
    const html = compiledTemplate(data);
    expect(html).toContain("S");
  });

  it("should handle custom_sections with empty bullets array", () => {
    const data = {
      personal: { name: "X" },
      layout: ["custom_sections"],
      custom_sections: [{ title: "C", bullets: [] }]
    };
    const html = compiledTemplate(data);
    expect(html).toContain("C");
    expect(html).not.toContain("<li>");
  });
});
