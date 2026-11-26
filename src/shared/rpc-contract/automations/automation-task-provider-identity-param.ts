import * as z from 'zod'

// A GitHub identity is only usable with both fields present and non-blank.
const GithubIdentityField = z.string().refine((value) => value.trim().length > 0, {
  message: 'Required'
})

export const TaskProviderIdentity = z
  .discriminatedUnion('provider', [
    z
      .object({
        provider: z.literal('github'),
        // Reject blank identity without trimming: normalization treats it as absent, but parsing must preserve nonblank bytes.
        owner: GithubIdentityField,
        repo: GithubIdentityField,
        host: z.string().optional()
      })
      .passthrough(),
    z
      .object({
        provider: z.literal('gitlab'),
        projectId: z.string().nullable().optional(),
        namespace: z.string().nullable().optional(),
        project: z.string().nullable().optional(),
        webUrl: z.string().nullable().optional()
      })
      .passthrough(),
    z
      .object({
        provider: z.literal('linear'),
        workspaceId: z.string().nullable().optional(),
        workspaceName: z.string().nullable().optional(),
        teamId: z.string().nullable().optional(),
        teamKey: z.string().nullable().optional()
      })
      .passthrough(),
    z
      .object({
        provider: z.literal('jira'),
        siteId: z.string().nullable().optional(),
        siteUrl: z.string().nullable().optional(),
        projectKey: z.string().nullable().optional()
      })
      .passthrough(),
    // Fields follow DART_TASK_PROVIDER_IDENTITY_FIELDS in shared/dart/dart-types.ts.
    z
      .object({
        provider: z.literal('dart'),
        userId: z.string().nullable().optional()
      })
      .passthrough()
  ])
  .optional()
  .nullable()
