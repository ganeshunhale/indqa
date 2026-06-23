import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

async function registerAndToken(email) {
  const res = await request(app).post('/api/auth/register').send({ name: 'User', email, password: 'password1' });
  return res.body.token;
}

describe('Conversation routes', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/conversations');
    expect(res.status).toBe(401);
  });

  it('creates and lists the user\'s conversations', async () => {
    const token = await registerAndToken('list@example.com');
    const create = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'hi' });
    expect(create.status).toBe(201);

    const list = await request(app).get('/api/conversations').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.conversations).toHaveLength(1);
  });

  it('enforces ownership when fetching messages (404 for another user)', async () => {
    const tokenA = await registerAndToken('owner@example.com');
    const tokenB = await registerAndToken('intruder@example.com');
    const create = await request(app).post('/api/conversations').set('Authorization', `Bearer ${tokenA}`).send({});
    const convId = create.body.conversation._id;

    const res = await request(app)
      .get(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('rejects an invalid conversation id (400)', async () => {
    const token = await registerAndToken('badid@example.com');
    const res = await request(app)
      .get('/api/conversations/not-an-id/messages')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('deletes a conversation', async () => {
    const token = await registerAndToken('delete@example.com');
    const create = await request(app).post('/api/conversations').set('Authorization', `Bearer ${token}`).send({});
    const id = create.body.conversation._id;
    const del = await request(app).delete(`/api/conversations/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
  });
});
