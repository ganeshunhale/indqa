import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

// Register a user and return their token + auto-created (owned) workspace id.
async function registerUser(email) {
  const res = await request(app).post('/api/auth/register').send({ name: 'Test User', email, password: 'password1' });
  return { token: res.body.token, id: res.body.user.id, workspaceId: res.body.activeWorkspaceId };
}

describe('Workspace-scoped admin RBAC + analytics', () => {
  it('forbids a workspace member from managing the knowledge base (403)', async () => {
    const owner = await registerUser('ws-owner@example.com');
    const member = await registerUser('ws-member@example.com');

    // Owner invites the existing member user into their workspace as a 'member'.
    const invite = await request(app)
      .post(`/api/workspaces/${owner.workspaceId}/invites`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: 'ws-member@example.com', role: 'member' });
    expect(invite.status).toBe(201);

    // The member, acting in the owner's workspace, is forbidden.
    const res = await request(app)
      .get('/api/admin/knowledge')
      .set('Authorization', `Bearer ${member.token}`)
      .set('X-Workspace-Id', owner.workspaceId);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('allows an owner to list their workspace knowledge base (200)', async () => {
    const owner = await registerUser('kb-owner@example.com');
    const res = await request(app)
      .get('/api/admin/knowledge')
      .set('Authorization', `Bearer ${owner.token}`)
      .set('X-Workspace-Id', owner.workspaceId);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('rejects a request for a workspace the user does not belong to (403)', async () => {
    const owner = await registerUser('a-owner@example.com');
    const stranger = await registerUser('a-stranger@example.com');
    const res = await request(app)
      .get('/api/admin/knowledge')
      .set('Authorization', `Bearer ${stranger.token}`)
      .set('X-Workspace-Id', owner.workspaceId);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WORKSPACE_FORBIDDEN');
  });

  it('forbids members from analytics (403) and allows owners (200)', async () => {
    const owner = await registerUser('an-owner@example.com');
    const member = await registerUser('an-member@example.com');
    await request(app)
      .post(`/api/workspaces/${owner.workspaceId}/invites`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: 'an-member@example.com', role: 'member' });

    const forbidden = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${member.token}`)
      .set('X-Workspace-Id', owner.workspaceId);
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${owner.token}`)
      .set('X-Workspace-Id', owner.workspaceId);
    expect(ok.status).toBe(200);
    expect(ok.body.totals).toBeDefined();
    expect(ok.body.grounding).toHaveProperty('confidenceThreshold');
  });
});
