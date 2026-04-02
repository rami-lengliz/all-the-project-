# RentAI — Chat Feature Demo Guide

---

## 1. Reset & Seed

```powershell
# In project root — wipes DB, recreates all data
npm run seed
```

Expected: `Seed completed successfully!` printed in console.

---

## 2. Start Servers

```powershell
# Terminal 1 — backend (port 3001)
npm run start:dev

# Terminal 2 — frontend (port 3000)
cd frontend
npm run dev
```

Open browser at `http://localhost:3000`.

---

## 3. Accounts

| Role   | Email                  | Password    |
|--------|------------------------|-------------|
| Renter | `user6@example.com`    | `password123` |
| Host   | `user1@example.com`    | `password123` |

Use **two separate browser windows** (or normal + Incognito) so both sessions stay logged in simultaneously.

---

## 4. Demo Steps

### A — Contact Host → Open Thread

1. **Window A (Renter):** Log in as `user6@example.com`
2. Go to `/client/bookings`
3. Click **"Contact host"** on any booking
   - If the booking already has a conversation → navigates directly to `/messages/{id}`
   - If not → creates one on-the-fly (spinner shows briefly), then navigates
4. **Expected:** Thread page opens with any existing messages loaded, oldest at top

---

### B — Send a Message (Renter → Host)

5. **Window B (Host):** Log in as `user1@example.com`, open the **same** conversation via `/messages`
6. **Window A:** Type `"Hello, is this still available?"` → press **Enter** or click **Send**
7. **Expected:**
   - Window A: message appears on the **right** (blue) instantly via `messageSent` event
   - Window B: message appears on the **left** (grey) instantly via `newMessage` event
   - No duplicate, no page refresh needed

---

### C — Host Replies

8. **Window B:** Type `"Yes, available! When do you need it?"` → Send
9. **Expected:**
   - Window B: appears on the right instantly
   - Window A: appears on the left instantly
   - Window A: `PATCH /api/chat/messages/read` fires automatically (message marked read)

---

### D — Unread Badge Updates on Inbox

10. **Window A:** Navigate to `/messages` (inbox view — do NOT open the thread)
11. **Window B:** Send another message: `"Let me know the dates!"`
12. **Expected (within ~1 second):**
    - Window A inbox badge increments (red dot or count next to "Messages" title)
    - The conversation row moves to the top of the list
    - Conversation row shows **bold** preview text

---

### E — Mark Read by Opening Thread

13. **Window A:** Click the conversation with the new unread message
14. **Expected:**
    - Thread opens, message visible
    - Within ~1 second: `PATCH /api/chat/messages/read` fires
    - Navigate back to `/messages` → badge **clears immediately** (window-focus refetch)
    - Header Messages icon badge also clears within 10 seconds (polls every 10s)

---

### F — Typing Indicator

15. **Window A:** Start typing in the input box — **do not send**
16. **Expected (Window B):** `"... is typing"` indicator appears within ~400ms
17. **Window A:** Stop typing, wait ~1.2 seconds
18. **Expected (Window B):** Indicator disappears automatically

---

## 5. Expected Outcomes Summary

| Action | Window A (Renter) | Window B (Host) |
|---|---|---|
| Renter sends message | Bubble appears right (blue) ✓ | Bubble appears left (grey) ✓ |
| Host replies | Bubble appears left (grey) ✓ | Bubble appears right (blue) ✓ |
| New message arrives while on inbox | Unread badge increments ✓ | — |
| Thread opened | markRead fires, badge clears ✓ | — |
| Typing starts | — | "... is typing" shows ✓ |
| Typing stops 1.2s | — | Indicator disappears ✓ |

---

## 6. Troubleshooting

| Symptom | Check |
|---|---|
| Badge never updates | `Network > GET /api/chat/unread-count` should return `200`. If `404`: backend not running or port wrong |
| Messages don't arrive in real time | `Network > WS` — look for a socket connected to `ws://localhost:3001/socket.io`. If missing: check `NEXT_PUBLIC_API_URL=http://localhost:3001` in `frontend/.env.local` |
| "Contact host" spins forever | `Network > POST /api/chat/conversations` failing — check backend is running |
| Typing indicator never appears | Check `Network > WS` for outgoing `typing` frames — if missing, input debounce timer hasn't fired (wait 400ms after typing) |
