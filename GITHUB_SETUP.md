# Setting up Git + GitHub on your Mac, and pushing this repo

A full walkthrough assuming you've never done this before. Every command
below goes into **Terminal** (Cmd+Space, type "Terminal", press Return).
Paste each block in, press Return, wait for it to finish, then move to
the next one.

## 1. Install Git

```bash
git --version
```

If you see a version number (e.g. `git version 2.39.3`), skip to step 2.
If instead macOS pops up a dialog about "command line developer tools",
click **Install**, wait for it to finish (a few minutes), then run the
command again to confirm it now shows a version.

## 2. Tell git who you are (one-time)

Git wants a name and email attached to every commit -- doesn't need to
match your GitHub login, just identifies you in the history:

```bash
git config --global user.name "Alonso Gonzalez"
git config --global user.email "alonso.gonzalez.glez@gmail.com"
```

## 3. Install the GitHub CLI (`gh`) -- this is what makes login painless

Without this, GitHub makes you generate and paste a "personal access
token" by hand, which is exactly the kind of fiddly step that causes the
errors you've been hitting. `gh` instead logs you in through a normal
browser sign-in.

Check if you already have Homebrew (a package installer for Mac):

```bash
brew --version
```

**If that shows a version:** install `gh` with:

```bash
brew install gh
```

**If `brew` isn't found:** install Homebrew first (official installer,
takes a couple minutes):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow any on-screen instructions it prints at the end (it sometimes
asks you to run one or two more lines to finish adding it to your PATH
-- copy-paste exactly what it tells you to). Then run `brew install gh`
as above.

## 4. Log in to GitHub from Terminal

```bash
gh auth login
```

It'll ask a few questions -- answer:
- What account do you want to log into? → **GitHub.com**
- What is your preferred protocol? → **HTTPS**
- Authenticate Git with your GitHub credentials? → **Yes**
- How would you like to authenticate? → **Login with a web browser**

It'll show you a one-time code and open your browser to github.com --
**sign in as alonsonetmxorg-web** there, paste in the code if asked, and
approve. Terminal will confirm once it's done ("Logged in as
alonsonetmxorg-web").

## 5. Create the GitHub repo and push -- one command

`gh` can create the repo *and* push in a single step, so you don't need
the github.com/new page at all:

```bash
cd ~/Desktop/Instrumentalization/landscape-ecosystem-integrity-repo
gh repo create landscape-ecosystem-integrity --public --source=. --remote=origin --push
```

That creates a public repo named `landscape-ecosystem-integrity` under
alonsonetmxorg-web, wires this local folder to it, and pushes both
commits already sitting here -- all in one go.

## 6. Confirm

```bash
gh repo view --web
```

Opens the new repo in your browser. You should see `pipeline/`,
`dashboard/`, `README.md`, etc.

## If something goes wrong at step 5

Paste me the exact error text and I'll tell you what it means -- the
two most common ones are "a repository with that name already exists"
(pick a different name, or delete the old one on github.com first) and
"permission denied" (means step 4's login didn't fully complete -- rerun
`gh auth status` to check).

## After that

Delete this `GITHUB_SETUP.md` file if you want -- it's a one-time guide,
not part of the actual project.

Once it's pushed, `Inputs/`, `Outputs/`, `Trends_Calculations/`, and
`Description/` (170GB+ combined) are safe to clear off your machine --
none of it is needed to rebuild the dashboard from what's now in GitHub,
only to regenerate rasters from scratch later (see the main README's
"Rebuilding the data from scratch" section).
