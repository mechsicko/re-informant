# re:informant: putting it live

## Already set it up? Updating to the version with Solo, Public and Friends
1. Unzip the new `re-informant-site.zip`.
2. On GitHub, open your `re-informant` repository and click **Add file** → **Upload files**.
3. Open the unzipped folder, select **everything inside it**, and drag it onto the page.
   Files with the same name get replaced; that's what you want.
4. Click **Commit changes**. Vercel puts the new version live by itself in about a minute.

No new settings. Public and friends tables use the same database you already connected.

---

## First time

You need three free accounts: **GitHub**, **Vercel** (sign in with GitHub) and **Alchemy**.
About 20 minutes. No coding, no terminal.

## 1. Put the files on GitHub
1. Unzip `re-informant-site.zip`.
2. On github.com, click **+** → **New repository**, name it `re-informant`, click **Create repository**.
3. Click **uploading an existing file**. Open the unzipped folder, select **everything inside it**, and drag it onto the page.
4. Click **Commit changes**.

## 2. Put it on Vercel
1. On vercel.com, click **Add New** → **Project**, pick `re-informant`, click **Deploy**.
2. Wait about a minute. Your game is now at an address like `re-informant.vercel.app`.

## 3. Add the database (it remembers who's playing)
1. In your Vercel project, open **Storage** and add **Upstash for Redis** (free plan).
2. Connect it to the `re-informant` project.

## 4. Get an Alchemy key (it reads wallets)
1. On alchemy.com, sign up and click **Create new app**.
2. Choose the **Base** network (Mainnet) and copy the **API key**.

## 5. Add two settings
1. Open `your-address.vercel.app/api/setup`. It shows a random **SESSION_SECRET**; copy it.
2. In Vercel: **Settings** → **Environment Variables**. Add:
   - `ALCHEMY_API_KEY` = your Alchemy key
   - `SESSION_SECRET` = the text you copied
3. Go to **Deployments**, click **⋯** on the top one, then **Redeploy**.

## 6. Check it
1. Open `your-address.vercel.app/api/setup` again. Every line should have a ✓.
2. At the bottom it shows a **REGEN_VAULTS** line so staked re:gens count too.
   Add it like step 5 and redeploy once more.

## 7. Put it on your site
- **Easiest:** add a link to `your-address.vercel.app` on your site.
- **Your own address:** in Vercel, open **Settings** → **Domains** and add something like `informant.yoursite.com`.
  Vercel shows one DNS record. Add it wherever your domain is managed.

That's it. Holders press **Connect** in the ENTER tab, sign one free message, and pick their re:gens.
Everyone else can watch.

---

**Phones:** wallets only work inside the wallet app's browser. The page shows "Open in Coinbase Wallet" and
"Open in MetaMask" buttons for that.

**The modes:** ROOM is the hourly game you watch. PLAY has Solo (you and six bots), Public tables (anyone around,
bots fill empty seats) and Friends (a private table with a code to share; bots fill what's left). Played games
keep their own record on each player's device, separate from the weekly board.

**If lots of people play:** live tables check in with the database every second or two while a game is on.
If the game gets busy, keep an eye on your Upstash usage page; the free plan has a monthly limit.

**Updating the game later:** on GitHub, open the `public` folder, upload the new `index.html` over the old one
and commit. Vercel puts it live by itself.

If a Vercel or Alchemy menu is named a little differently, look for the same words nearby. The setup page in
step 6 tells you exactly what's still missing.

<details><summary>For a developer</summary>

`public/index.html` is the game. `api/` holds the server endpoints, and they are standard Web `Request → Response` handlers, so they move to
other hosts easily. `api/setup` checks the settings and finds the staking vault. `npm test` runs the server tests.
`npm run dev` runs it locally. Ownership: a re:gen counts if it's in the wallet or the wallet made the latest
deposit of it into a vault listed in `REGEN_VAULTS`. Traits map to roles in `lib/traits.js`.
</details>
