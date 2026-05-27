# App.geo.ca-v2

This project uses the [SvelteKit](https://kit.svelte.dev/) framework and [SST](https://sst.dev/) to build and deploy to AWS a full-stack application for searching and cataloging geospatial data.

## Setup

- Create a fork of the app.geo.ca-v2 repo for your personal development environment.
- Clone the repo in your dev environment using the following command in a new Linux terminal: `git clone <Your-forked-repo-url>`.
- Check to make sure node, npm, and nvm are installed with these commands:
  - `node -v`
  - `npm -v`
  - `nvm -v`
- If you get an error message for any of these commands, you will have to install the packages with these steps:
  - First install curl as a sudo user: `sudo apt-get install curl`.
  - Next install nvm: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash`.
  - Test to make sure nvm installed successfully: `command -v nvm`. Note: If successful, `nvm` will print. If nothing happens or an error is received, close and open a new terminal.
  - Next, install the latest stable version of node and npm: `nvm install --lts`. Note: A Node.js version that matches the `.nvmrc` may be required instead of the latest version. You can adjust the nvm install command by specifying the node version like this: `nvm install 18.20.8`. Replace the number with the correct version.
  - Confirm node and npm were installed: `node -v` and `npm -v`.
  - Check to make sure the correct version of npm is set as indicated by the `.nvmrc` file. See [nvm](https://github.com/nvm-sh/nvm).
- Navigate to your project's directory: `cd app.geo.ca-v2`. Note: the name of your directory may differ based on the name of your forked repo.
- Install node packages with: `npm i`.
- Navigate to the `/packages/web-app/` directory using `cd packages/web-app`.
- Install node packages here too with: `npm i`.

## Developing

After following the setup, start a development server with these steps:

- Set up your AWS credentials. [documentation](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
- Create a stage env file by copying `.env.example` to `.env.<your-stage-name>` (for local dev use `.env.dev`).
- `packages/web-app/.env` is an optional local override file for web-app runtime values read from `process.env` (for example `GEOCORE_API_DOMAIN`, `SEMANTIC_SEARCH_URL`, and `USER_TABLE_NAME`).
- Keep auth/stage settings (`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_CUSTOM_DOMAIN`) in your stage env file at the repository root (for example `.env.dev`).
- `packages/web-app/.env` is ignored by git and should stay local to your machine.
- Set the values for `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` from your OIDC app client.
- Set `OIDC_CUSTOM_DOMAIN` to the base auth host only (no `/oauth2` suffix), for example `https://auth.login-connexion.alpha.canada.ca`.
- Ensure login and logout URLs are configured in your OIDC provider app client (CanadaLogin/Cognito).
  - Allowed callback URLs.
    - http://localhost:8080/sign-in/receive
  - Allowed sign-out URLs.
    - http://localhost:8080/sign-in/logout
  - Back-channel logout URL.
    - http://localhost:8080/sign-in/back-channel-logout
- Local sign-out skips provider logout and clears app cookies directly to avoid back-channel logout failures against localhost.

- For local development, run `npm run dev` from the repository root. SST v4 starts the multiplexer and frontend together.
- Port cleanup behavior: before frontend dev starts, `/packages/web-app/scripts/kill-port.js` runs via `predev` and force-kills listeners on port `8080`.
- Warning: this can terminate any application currently using port `8080`, not just this project.
- Validate restored sign-in flow:
  - As a guest, favourite one or more records.
  - Click Sign in and complete authentication.
  - Confirm guest favourites are merged into the signed-in profile.
  - Confirm Sign out clears session and returns to map browser.
- Optional DB diagnostics (non-production only): open `/api/health/db` and confirm `tableAccessible: true`.
- For deployment, run `npx sst deploy --stage <yourStageName>`. You will need to deploy your environment in order to build any AWS resources like buckets and tables.
- Now run the steps under [## Importing Data](#importing-data).

## User Data Model

For signed-in users, the DynamoDB users table stores:

- `uuid`: stable user identifier from the auth token (`sub`, with `username` fallback).
- `favourites`: array of dataset record ids saved by the user.
- `mapConfigs`: array of saved map configurations for the Maps tab in Favourites.
- `authRevokedAt`: server-side revocation marker (token `iat` threshold) used for back-channel logout.

Not stored by current app code:

- OIDC tokens or session secrets.
- User profile attributes such as email or display name.
- Generic timestamps, TTL fields, or audit metadata beyond `authRevokedAt`.

Guest favourites are stored temporarily in the `guest_favourites` cookie and merged into the signed-in user's `favourites` list after authentication.

Favourites UI split:

- `/${lang}/favourites?tab=datasets` reads and manages dataset ids from `favourites`.
- `/${lang}/favourites?tab=maps` reads and manages saved map configs from `mapConfigs`.

## Building and deploying

- Set up your AWS credentials for the desired environment. [documentation](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
- Create a stage env file by copying `.env.example` to `.env.<your-stage-name>`.
- Keep auth/stage settings (`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_CUSTOM_DOMAIN`) in the root stage env file for the deployment target.
- `packages/web-app/.env` remains optional local-only overrides for web-app runtime values and is git-ignored.
- From `/`, run `npm i`.
- From `/packages/web-app/`, run `npm i`. A Node.js version that matches the `.nvmrc` may be required.
- Ensure login and logout URLs are configured in your OIDC provider app client.
  - Example allowed callback URLs.
    - https://d28mialgy1tfmv.cloudfront.net/sign-in/receive
  - Example allowed sign-out URLs.
    - https://d28mialgy1tfmv.cloudfront.net/sign-in/logout
  - Example back-channel logout URL.
    - https://d28mialgy1tfmv.cloudfront.net/sign-in/back-channel-logout

- Deploy from the root of the repository: `npx sst deploy --stage <yourStageName>`.

## Importing Data

Do the following while your project's server is running:

- From AWS, go to your S3 bucket list and find the bucket with a name like this: `<your-stage-name>-<your-project-name>-site-hnapbucket<some-other-random-characters>`.
- Click on the bucket name from the list to see the bucket's details.
- From the Objects tab, click on the 'Create Folder' button and create two new folders with these names:
  - `geocore`
  - `hnap`
- From the hnap folder, copy the content from the project's `data-samples` folder.
- This triggers the hnap-bridge lambda, generates the geojson records required for viewing, and stores them under `<your-bucket-name>/geojson`. Note that any record not imported this way will return a 404 when viewed.
