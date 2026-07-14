# NCME Classroom Assessment Commons

A public resource catalog with a Supabase-backed reviewer area for shared ratings, notes, resource editing, and submission moderation.

## Included functionality

- Public catalog with search and filters
- Public resource-submission form with a pending-review workflow
- Password-protected reviewer dashboard using Supabase Authentication
- Shared resource, rating, and note records
- Add, edit, publish, archive, and delete controls
- Five-criterion ratings that reviewers can enter, revise, or delete
- Automatic rating averages and Gold or Silver seals after three reviews
- Row Level Security that keeps individual ratings and internal notes private

## One-time Supabase setup

1. Open the Supabase project.
2. Open **SQL Editor**, create a new query, paste the complete contents of **supabase-schema.sql**, and select **Run**.
3. Open **Authentication > Users** and add this shared reviewer user:
   - Email: **cac-reviewers@ncme.org**
   - Password: the shared committee password
   - Mark the email as confirmed, if Supabase presents that option.
4. Open **Project Settings > API Keys** and rotate the previously shared secret key. The website does not use a secret key.
5. Confirm that Email authentication is enabled under **Authentication > Providers**.

The password is never stored in the repository. Supabase Authentication verifies it and issues a session to the browser.

## GitHub Pages

The included workflow publishes the site whenever the **main** branch changes.

1. In the GitHub repository, open **Settings > Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Open **Actions** and confirm the **Deploy Classroom Assessment Commons** workflow completes.

Expected site address: https://mikemaksimchuk.github.io/classroom-assessment-commons/

## Security model

- The browser-safe publishable key in **config.js** is intended for browser use.
- Row Level Security permits anonymous users to read published resources and submit pending resources.
- Only authenticated reviewers can read unpublished submissions, individual ratings, and internal notes.
- Only authenticated reviewers can change or delete records.
- Do not add a Supabase secret key, service-role key, database password, or reviewer password to this repository.

## Files

- **index.html**: page structure and interface
- **styles.css**: custom visual styles
- **app.js**: Supabase data access and application behavior
- **config.js**: browser-safe project configuration
- **supabase-schema.sql**: database tables, security policies, triggers, and initial resources
- **.github/workflows/pages.yml**: GitHub Pages deployment
