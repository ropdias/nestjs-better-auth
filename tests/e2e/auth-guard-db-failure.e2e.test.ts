import request from "supertest";
import { vi } from "vitest";
import { createTestApp, type TestAppSetup } from "../shared/test-utils.ts";

// Regression test for https://github.com/ThallesP/nestjs-better-auth/issues/159
//
// When the database is unreachable, Better Auth's getSession() rejects instead of
// resolving to null. The guard used to call getSession() before evaluating the
// route metadata, so the rejection bubbled up as a 500 on every route — including
// @AllowAnonymous() health/readiness probes whose whole purpose is to keep working
// while the database is down.
//
// The guard must now:
//  - let @AllowAnonymous() routes through regardless of the failure,
//  - let @OptionalAuth() routes through as anonymous,
//  - and still surface the failure on routes that actually require a session.
describe("auth guard db failure e2e", () => {
	let testSetup: TestAppSetup;

	beforeAll(async () => {
		testSetup = await createTestApp();
		// Simulate an infrastructure failure: better-auth rejects instead of
		// resolving to null (which is what it does for a missing/invalid session).
		vi.spyOn(testSetup.auth.api, "getSession").mockRejectedValue(
			new Error("simulated database connection failure"),
		);
	});

	afterAll(async () => {
		vi.restoreAllMocks();
		await testSetup.app.close();
	});

	it("still serves @AllowAnonymous() routes when getSession throws", async () => {
		const response = await request(testSetup.app.getHttpServer())
			.get("/test/public")
			.expect(200);

		expect(response.body).toMatchObject({ ok: true });
	});

	it("still serves @OptionalAuth() routes as anonymous when getSession throws", async () => {
		const response = await request(testSetup.app.getHttpServer())
			.get("/test/optional")
			.expect(200);

		expect(response.body).toMatchObject({ authenticated: false });
	});

	it("surfaces the failure on protected routes when getSession throws", async () => {
		await request(testSetup.app.getHttpServer())
			.get("/test/protected")
			.expect(500);
	});
});
