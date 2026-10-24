import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

const VALID_STORAGE   = ["kv", "db", "none"];
const VALID_AUDIENCES = ["everyone", "adults", "children"];

describe("manifest.json", () => {
  it("has required string fields", () => {
    for (const field of ["id", "name", "version", "description", "entrypoint", "runtime", "icon"]) {
      expect(manifest[field], `missing field: ${field}`).toBeTruthy();
    }
  });

  it("entrypoint is index.html", () => expect(manifest.entrypoint).toBe("index.html"));
  it("runtime is static",        () => expect(manifest.runtime).toBe("static"));

  it("storage is declared and valid", () => {
    expect(manifest.storage, "storage field is required").toBeTruthy();
    expect(VALID_STORAGE).toContain(manifest.storage);
  });

  it("version follows semver", () => expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/));

  it("permissions.default_audience is valid", () => {
    expect(VALID_AUDIENCES).toContain(manifest.permissions.default_audience);
  });

  it("permissions.requires_approval is boolean", () => {
    expect(typeof manifest.permissions.requires_approval).toBe("boolean");
  });

  it("data_access has reads and writes arrays", () => {
    expect(Array.isArray(manifest.data_access.reads)).toBe(true);
    expect(Array.isArray(manifest.data_access.writes)).toBe(true);
  });
});

// ── Care team ─────────────────────────────────────────────────────────────────
// A "care" medication is read by the adults and by the members of the hub
// group an admin names in care_team_group_id; a nanny who signs in as a guest
// is a non-adult inside a row policy, so only the privileged group reaches it.
describe("care team", () => {
  const meds = manifest.row_policies.medications;

  it("reads a care medication as an adult or as the care team group, select only", () => {
    expect(meds.adult_values).toEqual(["family", "care"]);
    expect(meds.privileged_values).toEqual(["care"]);
    // Never "family": the adults' own prescriptions must not reach the nanny.
    expect(meds.privileged_values).not.toContain("family");
    expect(meds.everyone_values).toEqual([]);
    expect(meds.privileged_groups).toEqual([
      { settings_table: "settings", settings_key: "care_team_group_id", actions: ["select"] },
    ]);
  });

  it("keeps the group pointer admin-written", () => {
    expect(manifest.row_policies.settings).toEqual({ kind: "app_config" });
    expect(manifest.admin_config).toEqual({ settings_table: "settings", keys: ["care_team_group_id"] });
    expect(manifest.data_access.reads).toContain("family.groups");
    expect(existsSync(join(__dirname, "../migrations/008_care_team.sql"))).toBe(true);
  });

  it("lets an adult mark a child's medication for the care team", () => {
    // "adult_owner" would keep a parent from naming the column on the child's row.
    expect(meds.column_write_acls.visibility).toEqual({ writable_by: ["adult"] });
    expect(meds.write_visibility_scoped).toBe(true);
  });

  it("follows doses to the medication, so the care team ticks a care medication's doses", () => {
    expect(manifest.row_policies.doses).toMatchObject({ kind: "inherit_visibility", parent_table: "medications" });
    // Nobody rewrites who ticked a dose: in a co-parenting space it decides
    // whose tick it is. The page only ever INSERTs logged_by.
    expect(manifest.row_policies.doses.column_write_acls).toEqual({
      logged_by: { writable_by: [], actions: ["update"] },
    });
  });

  it("never re-keys a medication, and a deleted medication takes its doses", () => {
    // A swapped id would move another medication's doses under a child's.
    expect(meds.column_write_acls.id).toEqual({ writable_by: [], actions: ["update"] });
    // Without the cascade a deleted medication's id could be re-inserted under
    // a child to adopt its orphaned doses (the page archives, never deletes).
    expect(manifest.delete_cascades).toEqual({ medications: [{ table: "doses", foreign_key: "medication_id" }] });
  });

  it("lets either co-parent add and maintain a child's medication, never the other parent's", () => {
    // owner_or_visibility: a steward's INSERT keeps a CHILD owner in a co-parenting
    // space; one naming the other parent is stamped to the caller.
    expect(meds.supervisor_assigns_owner).toBe(true);
    expect(meds.coparenting_child_supervision).toBe(true);
    // inherit_visibility: either parent undoes the other's tick on a child's medication.
    expect(manifest.row_policies.doses.adults_bypass).toBe(true);
    expect(manifest.row_policies.doses.coparenting_child_supervision).toBe(true);
  });

  it("reminds the adults of a care medication's refill as of a shared one", () => {
    expect(manifest.date_reminders.everyone_values).toEqual(["family", "care"]);
  });
});

// ── ai_access SQL file validation ─────────────────────────────────────────────
// Auto-discovers all db_exports/db_mutations/db_inserts/db_deletes entries and
// validates each SQL file for statement type and single-statement (no semicolons,
// which is exactly what the hub enforces). There is no household_id filter to
// check — each household is its own D1 database.

if (manifest.ai_access) {
  const ai = manifest.ai_access;

  const SQL_TYPES = [
    { field: "db_exports",   dir: "queries",   keyword: /^(SELECT|WITH)\b/i, label: "SELECT or WITH" },
    { field: "db_mutations", dir: "mutations",  keyword: /^UPDATE\b/i,        label: "UPDATE"         },
    { field: "db_inserts",   dir: "inserts",    keyword: /^INSERT\b/i,        label: "INSERT"         },
    { field: "db_deletes",   dir: "deletes",    keyword: /^DELETE\b/i,        label: "DELETE"         },
  ];

  for (const { field, dir, keyword, label } of SQL_TYPES) {
    const names = ai[field] ?? [];
    if (names.length === 0) continue;

    describe(`ai_access.${field}`, () => {
      it(`each name has a src/${dir}/{name}.sql file`, () => {
        for (const name of names) {
          const path = join(__dirname, `../src/${dir}/${name}.sql`);
          expect(existsSync(path), `missing: src/${dir}/${name}.sql`).toBe(true);
        }
      });

      it(`each SQL file starts with ${label}`, () => {
        for (const name of names) {
          const path = join(__dirname, `../src/${dir}/${name}.sql`);
          if (!existsSync(path)) continue;
          const sql = readFileSync(path, "utf-8").trim();
          expect(
            keyword.test(sql),
            `src/${dir}/${name}.sql must start with ${label}, got: ${sql.slice(0, 50)}`
          ).toBe(true);
        }
      });

      it(`each SQL file is a single statement (no semicolons)`, () => {
        for (const name of names) {
          const path = join(__dirname, `../src/${dir}/${name}.sql`);
          if (!existsSync(path)) continue;
          const sql = readFileSync(path, "utf-8");
          expect(
            sql.includes(";"),
            `src/${dir}/${name}.sql must not contain semicolons`
          ).toBe(false);
        }
      });
    });
  }

  if (ai.db_inserts?.length) {
    describe("ai_access.db_inserts schemas", () => {
      it("each insert has a src/schemas/{name}.json file", () => {
        for (const name of ai.db_inserts) {
          const path = join(__dirname, `../src/schemas/${name}.json`);
          expect(existsSync(path), `missing: src/schemas/${name}.json`).toBe(true);
        }
      });

      it("each schema file is valid JSON", () => {
        for (const name of ai.db_inserts) {
          const path = join(__dirname, `../src/schemas/${name}.json`);
          if (!existsSync(path)) continue;
          expect(
            () => JSON.parse(readFileSync(path, "utf-8")),
            `src/schemas/${name}.json must be valid JSON`
          ).not.toThrow();
        }
      });

      it("each schema declares type:array with an items definition", () => {
        for (const name of ai.db_inserts) {
          const path = join(__dirname, `../src/schemas/${name}.json`);
          if (!existsSync(path)) continue;
          let schema;
          try { schema = JSON.parse(readFileSync(path, "utf-8")); } catch { continue; }
          expect(schema.type, `src/schemas/${name}.json must declare "type": "array"`).toBe("array");
          expect(
            Array.isArray(schema.items) || (typeof schema.items === "object" && schema.items !== null),
            `src/schemas/${name}.json must declare "items" to validate params`
          ).toBe(true);
        }
      });

      it("schema maxItems matches the number of $N placeholders in the SQL", () => {
        for (const name of ai.db_inserts) {
          const sqlPath    = join(__dirname, `../src/inserts/${name}.sql`);
          const schemaPath = join(__dirname, `../src/schemas/${name}.json`);
          if (!existsSync(sqlPath) || !existsSync(schemaPath)) continue;
          const sql = readFileSync(sqlPath, "utf-8");
          let schema;
          try { schema = JSON.parse(readFileSync(schemaPath, "utf-8")); } catch { continue; }
          const paramNums = [...sql.matchAll(/\$(\d+)/g)].map(m => parseInt(m[1], 10));
          const maxParam  = paramNums.length > 0 ? Math.max(...paramNums) : 0;
          expect(
            schema.maxItems,
            `src/schemas/${name}.json maxItems (${schema.maxItems}) must equal SQL $N count (${maxParam})`
          ).toBe(maxParam);
        }
      });
    });
  }
}
