-- NCME Classroom Assessment Commons
-- Run this complete script once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 240),
  url text not null unique check (url ~* '^https?://'),
  provider text not null default 'Contributor Submission',
  summary text not null default '',
  length text,
  resource_type text not null default 'Website',
  audience text[] not null default array['Public']::text[],
  topics text[] not null default '{}'::text[],
  grade_ranges text[] not null default array['All Grades']::text[],
  assessment_types text[] not null default '{}'::text[],
  status text not null default 'pending' check (status in ('pending', 'published', 'archived')),
  submitter_name text,
  submitter_email text,
  submission_rationale text,
  ratings_count integer not null default 0,
  average_score numeric(4,2),
  seal text check (seal is null or seal in ('Gold', 'Silver')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  reviewer_name text not null check (char_length(reviewer_name) between 1 and 160),
  alignment smallint not null check (alignment between 1 and 4),
  utility smallint not null check (utility between 1 and 4),
  equity smallint not null check (equity between 1 and 4),
  quality smallint not null check (quality between 1 and 4),
  currency smallint not null check (currency between 1 and 4),
  total_score smallint generated always as (alignment + utility + equity + quality + currency) stored,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource_id, reviewer_name)
);

create table if not exists public.resource_notes (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 160),
  note text not null check (char_length(note) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resources_status_idx on public.resources(status);
create index if not exists ratings_resource_idx on public.ratings(resource_id);
create index if not exists notes_resource_idx on public.resource_notes(resource_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at before update on public.resources
for each row execute function public.set_updated_at();

drop trigger if exists ratings_set_updated_at on public.ratings;
create trigger ratings_set_updated_at before update on public.ratings
for each row execute function public.set_updated_at();

drop trigger if exists notes_set_updated_at on public.resource_notes;
create trigger notes_set_updated_at before update on public.resource_notes
for each row execute function public.set_updated_at();

create or replace function public.refresh_resource_rating_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_resource_id uuid;
  review_count integer;
  review_average numeric(4,2);
begin
  target_resource_id = coalesce(new.resource_id, old.resource_id);

  select count(*)::integer, round(avg(total_score), 2)
  into review_count, review_average
  from public.ratings
  where resource_id = target_resource_id;

  update public.resources
  set ratings_count = review_count,
      average_score = case when review_count > 0 then review_average else null end,
      seal = case
        when review_count >= 3 and review_average >= 18 then 'Gold'
        when review_count >= 3 and review_average >= 14 then 'Silver'
        else null
      end
  where id = target_resource_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists ratings_refresh_resource on public.ratings;
create trigger ratings_refresh_resource
after insert or update or delete on public.ratings
for each row execute function public.refresh_resource_rating_summary();

alter table public.resources enable row level security;
alter table public.ratings enable row level security;
alter table public.resource_notes enable row level security;

drop policy if exists "Published resources are public" on public.resources;
create policy "Published resources are public"
on public.resources for select
to anon
using (status = 'published');

drop policy if exists "Reviewers can read all resources" on public.resources;
create policy "Reviewers can read all resources"
on public.resources for select
to authenticated
using (true);

drop policy if exists "Public may submit pending resources" on public.resources;
create policy "Public may submit pending resources"
on public.resources for insert
to anon
with check (status = 'pending');

drop policy if exists "Reviewers can add resources" on public.resources;
create policy "Reviewers can add resources"
on public.resources for insert
to authenticated
with check (true);

drop policy if exists "Reviewers can update resources" on public.resources;
create policy "Reviewers can update resources"
on public.resources for update
to authenticated
using (true)
with check (true);

drop policy if exists "Reviewers can delete resources" on public.resources;
create policy "Reviewers can delete resources"
on public.resources for delete
to authenticated
using (true);

drop policy if exists "Reviewers manage ratings" on public.ratings;
create policy "Reviewers manage ratings"
on public.ratings for all
to authenticated
using (true)
with check (true);

drop policy if exists "Reviewers manage notes" on public.resource_notes;
create policy "Reviewers manage notes"
on public.resource_notes for all
to authenticated
using (true)
with check (true);

revoke all on public.resources from anon, authenticated;
revoke all on public.ratings from anon, authenticated;
revoke all on public.resource_notes from anon, authenticated;

grant select on public.resources to anon;
grant insert (
  title, url, provider, summary, length, resource_type, audience, topics,
  grade_ranges, assessment_types, status, submitter_name, submitter_email,
  submission_rationale
) on public.resources to anon;
grant all on public.resources to authenticated;
grant all on public.ratings to authenticated;
grant all on public.resource_notes to authenticated;

insert into public.resources (
  title, url, provider, summary, length, audience, topics, grade_ranges,
  assessment_types, resource_type, status
) values
(
  'Formative Assessment Modules',
  'https://ncme.org/resources/professional-learning/formative-assessment-modules/',
  'National Council on Measurement in Education',
  'The NCME FACT resource bank offers classroom-tested formative assessment practices that educators can use across curricula, including pre-assessment, self-assessment, exemplars, feedback breaks, and paper feedback.',
  'Collection of free modules',
  array['Teacher','Student Teacher','Instructional Coach'],
  array['Formative Assessment','Feedback','Student Self-Assessment'],
  array['All Grades'],
  array['Formative Assessment'],
  'Course',
  'published'
),
(
  'Classroom Assessment Standards Digital Module',
  'https://ncme.org/resources/professional-learning/items/classroom-assessment-standards/',
  'National Council on Measurement in Education',
  'An NCME ITEMS module introducing the 16 Classroom Assessment Standards across the Foundations, Use, and Quality domains, with narrated slides, reflection questions, and application resources.',
  'Self-paced module with downloadable resources',
  array['Teacher','Student Teacher','Building Administrator','Assessment Professional'],
  array['Assessment Literacy','Assessment Quality','Fairness','Standards'],
  array['All Grades','Higher Education'],
  array['Classroom Assessment'],
  'Course',
  'published'
),
(
  'Fairness in Classroom Assessment: Dimensions and Tensions',
  'https://ncme.org/resources/professional-learning/items/fairness-in-classroom-assessment-dimensions-and-tensions/',
  'National Council on Measurement in Education',
  'An NCME ITEMS professional-learning module focused on fairness in classroom assessment, including downloadable slides and references for individual or collaborative study.',
  'Digital module and references',
  array['Teacher','Student Teacher','Building Administrator','Researcher'],
  array['Fairness','Equity and Inclusion','Assessment Literacy'],
  array['All Grades','Higher Education'],
  array['Classroom Assessment'],
  'Course',
  'published'
),
(
  'Classroom Assessment Learning Modules',
  'https://www.nciea.org/library/classroom-assessment-learning-modules/',
  'National Center for the Improvement of Educational Assessment',
  'A Creative Commons collection of professional-learning modules that helps educators build classroom assessment literacy in areas critical to student success and reducing achievement gaps.',
  '23 professional-learning modules',
  array['Teacher','Instructional Coach','Building Administrator','District Administrator'],
  array['Assessment Literacy','Professional Learning','Equity and Inclusion'],
  array['All Grades'],
  array['Classroom Assessment','Formative Assessment','Summative Assessment'],
  'Toolkit',
  'published'
),
(
  'Building a Conceptual Framework for Assessment Literacy',
  'https://www.nciea.org/library/building-a-conceptual-framework-for-assessment-literacy/',
  'National Center for the Improvement of Educational Assessment',
  'An open paper framing assessment literacy as a context-dependent, multidimensional construct whose requirements differ for teachers, administrators, policymakers, students, and families.',
  'Open paper',
  array['Teacher','Building Administrator','District Administrator','Policymaker','Researcher'],
  array['Assessment Literacy','Balanced Assessment Systems','Professional Learning'],
  array['All Grades'],
  array['Classroom Assessment','Interim Assessment','Statewide Assessment'],
  'Document',
  'published'
),
(
  'Reimagining Balanced Assessment Systems',
  'https://www.nciea.org/blog/reimagining-balanced-assessment-systems/',
  'National Center for the Improvement of Educational Assessment',
  'A contemporary vision for balanced assessment systems centered on equitable and ambitious classroom learning, coherent assessment purposes, and strong educator assessment literacy.',
  'Article and linked publication',
  array['Building Administrator','District Administrator','Policymaker','Assessment Professional'],
  array['Balanced Assessment Systems','Equity and Inclusion','Assessment Policy'],
  array['All Grades'],
  array['Formative Assessment','Interim Assessment','Summative Assessment','Statewide Assessment'],
  'Website',
  'published'
),
(
  'Supporting the Implementation of Formative Assessment',
  'https://www.nciea.org/blog/supporting-the-implementation-of-formative-assessment/',
  'National Center for the Improvement of Educational Assessment',
  'A practical discussion of leadership conditions, barriers, and facilitators that influence whether formative assessment processes become sustained classroom practice.',
  'Article',
  array['Instructional Coach','Building Administrator','District Administrator'],
  array['Formative Assessment','Implementation','Professional Learning'],
  array['All Grades'],
  array['Formative Assessment'],
  'Website',
  'published'
),
(
  'An Argument-Based Framework for Validating Formative Assessment in the Classroom',
  'https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.605999/full',
  'Frontiers in Education',
  'An open-access scholarly article applying an argument-based validity framework to classroom-based formative assessment and the interpretations and uses educators make from evidence.',
  'Open-access journal article',
  array['Teacher Educator','Researcher','Assessment Professional'],
  array['Validity','Formative Assessment','Evidence-Informed Decision Making'],
  array['All Grades','Higher Education'],
  array['Formative Assessment'],
  'Journal Article',
  'published'
),
(
  'Defining Authentic Classroom Assessment',
  'https://files.eric.ed.gov/fulltext/EJ977576.pdf',
  'Practical Assessment, Research, and Evaluation',
  'An open-access review that synthesizes definitions of authentic assessment and identifies recurring characteristics such as realism, cognitive complexity, meaningful performance, and student involvement.',
  'Open-access journal article, 18 pages',
  array['Teacher','Student Teacher','Teacher Educator','Researcher'],
  array['Authentic Assessment','Performance Assessment','Assessment Design'],
  array['All Grades','Higher Education'],
  array['Formative Assessment','Summative Assessment'],
  'Journal Article',
  'published'
),
(
  'Formative Assessment and Next-Generation Assessment Systems',
  'https://files.eric.ed.gov/fulltext/ED543063.pdf',
  'Council of Chief State School Officers',
  'Margaret Heritage explains formative assessment as an instructional process and describes how it fits within coherent next-generation assessment systems.',
  'Open paper, 36 pages',
  array['Teacher','Building Administrator','District Administrator','Policymaker'],
  array['Formative Assessment','Balanced Assessment Systems','Assessment Policy'],
  array['All Grades'],
  array['Formative Assessment','Interim Assessment','Summative Assessment'],
  'Document',
  'published'
),
(
  'Six Steps to Formative Classroom Assessment',
  'https://wida.wisc.edu/news/six-steps-formative-classroom-assessment',
  'WIDA',
  'A practitioner-facing overview of a six-step formative classroom assessment process, with attention to multilingual learners, learner independence, collaboration, and feedback.',
  'Article and video',
  array['Teacher','Student Teacher','Instructional Coach'],
  array['Formative Assessment','Multilingual Learners','Feedback','Student Agency'],
  array['All Grades'],
  array['Formative Assessment'],
  'Website',
  'published'
),
(
  'Assessment Literacy Standards: A National Imperative',
  'https://www.michiganassessmentconsortium.org/wp-content/uploads/mac_AssessLitStds_2017_screen-9.19.17-2.pdf',
  'Michigan Assessment Consortium',
  'Role-specific assessment literacy standards for students and families, teachers, administrators, policymakers, and other stakeholders across educational systems.',
  'Open standards document, 32 pages',
  array['Teacher','Building Administrator','District Administrator','Policymaker','Public'],
  array['Assessment Literacy','Assessment Policy','Assessment Use and Reporting'],
  array['All Grades'],
  array['Formative Assessment','Interim Assessment','Summative Assessment','Statewide Assessment'],
  'Document',
  'published'
)
on conflict (url) do update set
  title = excluded.title,
  provider = excluded.provider,
  summary = excluded.summary,
  length = excluded.length,
  audience = excluded.audience,
  topics = excluded.topics,
  grade_ranges = excluded.grade_ranges,
  assessment_types = excluded.assessment_types,
  resource_type = excluded.resource_type,
  status = excluded.status;

-- Final verification queries
select status, count(*) from public.resources group by status order by status;
select count(*) as seeded_ratings from public.ratings;
