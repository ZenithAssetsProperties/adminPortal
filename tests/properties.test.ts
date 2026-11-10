import { describe, expect, it } from "vitest";
import { anon, asStaff, makeStaff, uniq } from "./helpers";

const body = () => ({ name: `Lekki Duplex ${uniq()}`, type: "house", state: "Lagos", city: "Lekki", priceKobo: 18_500_000_000, status: "available" });

describe("admin properties API", () => {
  it("rejects requests with no session", async () => {
    expect((await anon("/api/admin/properties")).status).toBe(401);
  });

  it("lets content staff create, edit, mark sold and soft-delete only if permitted", async () => {
    const content = await makeStaff("content");
    const admin = await makeStaff("admin");
    const created = await asStaff(content.cookie, "/api/admin/properties", { body: body() });
    expect(created.status).toBe(201);
    const id = created.json.id;

    const patched = await asStaff(content.cookie, `/api/admin/properties/${id}`, { method: "PATCH", body: { bedrooms: 4 } });
    expect(patched.status).toBe(200);
    expect(patched.json.bedrooms).toBe(4);

    expect((await asStaff(content.cookie, `/api/admin/properties/${id}/status`, { body: { status: "sold" } })).json.status).toBe("sold");
    // content role has no delete permission
    expect((await asStaff(content.cookie, `/api/admin/properties/${id}`, { method: "DELETE" })).status).toBe(403);
    expect((await asStaff(admin.cookie, `/api/admin/properties/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await asStaff(admin.cookie, `/api/admin/properties/${id}`)).status).toBe(404);
  });

  it("validates input and blocks roles without write access", async () => {
    const admin = await makeStaff("admin");
    const bad = await asStaff(admin.cookie, "/api/admin/properties", { body: { name: "x", type: "castle" } });
    expect(bad.status).toBe(400);
    const finance = await makeStaff("finance");
    expect((await asStaff(finance.cookie, "/api/admin/properties", { body: body() })).status).toBe(403);
  });

  it("searches, filters and paginates", async () => {
    const admin = await makeStaff("admin");
    const tag = uniq();
    await asStaff(admin.cookie, "/api/admin/properties", { body: { ...body(), name: `Findme ${tag} A` } });
    await asStaff(admin.cookie, "/api/admin/properties", { body: { ...body(), name: `Findme ${tag} B`, status: "draft" } });
    const all = await asStaff(admin.cookie, `/api/admin/properties?q=${tag}`);
    expect(all.json.total).toBe(2);
    const drafts = await asStaff(admin.cookie, `/api/admin/properties?q=${tag}&status=draft`);
    expect(drafts.json.total).toBe(1);
    const page = await asStaff(admin.cookie, `/api/admin/properties?q=${tag}&pageSize=1&page=2`);
    expect(page.json.items).toHaveLength(1);
    // % in a search must be matched literally, not as a wildcard
    expect((await asStaff(admin.cookie, "/api/admin/properties?q=%25")).json.total).toBe(0);
  });

  it("only accepts real images and https links as media", async () => {
    const admin = await makeStaff("admin");
    const { json: p } = await asStaff(admin.cookie, "/api/admin/properties", { body: body() });
    const fake = new FormData();
    fake.set("file", new File([Buffer.from("<html>not an image at all</html>")], "x.jpg", { type: "image/jpeg" })); fake.set("kind", "photo");
    expect((await asStaff(admin.cookie, `/api/admin/properties/${p.id}/media`, { body: fake })).status).toBe(400);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const real = new FormData(); real.set("file", new File([png], "a.png", { type: "image/png" })); real.set("kind", "photo");
    const ok = await asStaff(admin.cookie, `/api/admin/properties/${p.id}/media`, { body: real });
    expect(ok.status).toBe(201);
    expect((await asStaff(admin.cookie, `/api/admin/properties/${p.id}/media`, { body: { kind: "video", url: "http://insecure.example/v" } })).status).toBe(400);
    expect((await asStaff(admin.cookie, `/api/admin/properties/${p.id}/media`, { body: { kind: "video", url: "https://youtu.be/abc" } })).status).toBe(201);
    const list = await asStaff(admin.cookie, `/api/admin/properties/${p.id}/media`);
    expect(list.json.items).toHaveLength(2);
    expect(list.json.items.find((m: any) => m.kind === "photo").isCover).toBe(true);
  });
});
