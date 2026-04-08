# SPIKE! Volleyball - Multiplayer

A browser volleyball game with local play, bot play, online multiplayer, and mobile touch controls.

https://ghostriley2528.github.io/SPIKE/

## Setup

1. Install Node.js LTS from `https://nodejs.org`
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Open `http://localhost:3000`

## Modes

- Online Multiplayer: play with a friend via a room code
- vs BOT: single-player match against the computer bot
- 1v1 Local: two players on the same keyboard

## Controls

- Move: `A / D`
- Jump: `Space`
- Serve: `F`
- Bump: hold `E`
- Set: hold `Q`
- Spike: click while airborne
- Tip: hold `T`
- Block: hold `R`

## Mobile Controls

On phones and tablets, the game shows an on-screen control deck automatically:

- Left / Right: move
- Jump: jump
- Serve: serve when waiting
- Bump / Set / Tip / Block: hold and release like keyboard controls
- Spike: tap while airborne, or press just before jumping for a spike grace window

## Notes

- The bot uses built-in heuristics only. There is no training pipeline anymore.
- Online multiplayer still uses Firebase Realtime Database rooms.
