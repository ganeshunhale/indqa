import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

async function registerUser(email) {
  const res = await request(app).post('/api/auth/register').send({ name: 'WS User', email, password: 'password1' });
  return { token: res.body.token, id: res.body.user.id, workspaceId: res.body.activeWorkspaceId, body: res.body };
}

describe('Workspaces', () => {
  it('auto-creates a personal owned workspace on registration', async () => {
    const u = await registerUser('solo@example.com');
    expect(u.workspaceId).toBeTruthy();
    expect(u.body.workspaces).toHaveLength(1);
    expect(u.body.workspaces[0].role).toBe('owner');
  });

  it('lets a user create an additional workspace', async () => {
    const u = await registerUser('creator@example.com');
    const res = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${u.token}`)
      .send({ name: 'Acme Docs' });
    expect(res.status).toBe(201);
    expect(res.body.workspace.role).toBe('owner');

    const list = await request(app).get('/api/workspaces').set('Authorization', `Bearer ${u.token}`);
    expect(list.body.workspaces).toHaveLength(2);
  });

  it('adds an existing user immediately when invited, and they can see the workspace', async () => {
    const owner = await registerUser('owner2@example.com');
    const invitee = await registerUser('invitee@example.com');

    const invite = await request(app)
      .post(`/api/workspaces/${owner.workspaceId}/invites`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: 'invitee@example.com', role: 'admin' });
    expect(invite.status).toBe(201);
    expect(invite.body.status).toBe('added');

    const list = await request(app).get('/api/workspaces').set('Authorization', `Bearer ${invitee.token}`);
    const ids = list.body.workspaces.map((w) => w.id);
    expect(ids).toContain(owner.workspaceId);
  });

  it('forbids a non-admin member from inviting (403)', async () => {
    const owner = await registerUser('owner3@example.com');
    const member = await registerUser('member3@example.com');
    await request(app)
      .post(`/api/workspaces/${owner.workspaceId}/invites`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: 'member3@example.com', role: 'member' });

    const res = await request(app)
      .post(`/api/workspaces/${owner.workspaceId}/invites`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ email: 'someoneelse@example.com', role: 'member' });
    expect(res.status).toBe(403);
  });

  it('isolates conversations per workspace', async () => {
    const u = await registerUser('multi@example.com');
    const second = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${u.token}`)
      .send({ name: 'Second WS' });
    const secondWs = second.body.workspace.id;

    // Create a conversation in the personal (default) workspace.
    await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${u.token}`)
      .set('X-Workspace-Id', u.workspaceId)
      .send({ language: 'hi' });

    // The second workspace should have none.
    const listSecond = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${u.token}`)
      .set('X-Workspace-Id', secondWs);
    expect(listSecond.body.conversations).toHaveLength(0);

    // The first workspace should have exactly one.
    const listFirst = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${u.token}`)
      .set('X-Workspace-Id', u.workspaceId);
    expect(listFirst.body.conversations).toHaveLength(1);
  });
});
