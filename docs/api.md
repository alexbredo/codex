
# CodexStructure API Documentation

This document provides an overview of the API endpoints available in the CodexStructure application.

## Base URL

All API routes are prefixed with `/api`. For example, the login route is `/api/auth/login`.

## Authentication

Most endpoints require the user to be authenticated. The API supports two methods of authentication:

1.  **Session Cookie (for Browser-based Clients)**: For users interacting with the web application directly, authentication is handled via an HTTP-only session cookie named `codex_structure_session`, which is set upon successful login. Requests made from the frontend automatically include this cookie.

2.  **Bearer Token (for API Clients)**: For programmatic access, you can use an API token. Generate a token in the User Administration section of the UI. Include this token in the `Authorization` header of your API requests.

    **Example:**
    ```
    Authorization: Bearer codex_...your_generated_token...
    ```

For development purposes, a `DEBUG_MODE` flag can be enabled in `src/lib/auth.ts`. When active, all API requests are treated as if they are coming from a mock administrator user, bypassing login requirements.

---

## 1. Authentication (`/api/auth`)

### POST /login
Logs in a user.
- **Method:** `POST`
- **Body:** `{ "username": "string", "password": "string" }`
- **Success Response (200):** `{ "id": "string", "username": "string", "roles": [{"id": "string", "name": "string"}] }`
- **Error Response (401):** `{ "error": "Invalid username or password" }`

### POST /logout
Logs out the current user by clearing their session cookie.
- **Method:** `POST`
- **Success Response (200):** `{ "message": "Logged out successfully" }`

### GET /me
Retrieves the currently authenticated user's information.
- **Method:** `GET`
- **Success Response (200):** `{ "id": "string", "username": "string", "roles": [{"id": "string", "name": "string"}], "permissionIds": ["string"] }` or `null` if not authenticated.

### POST /register
Registers a new user. The first user to register becomes an 'administrator'.
- **Method:** `POST`
- **Body:** `{ "username": "string", "password": "string" }`
- **Success Response (201):** `{ "id": "string", "username": "string", "roles": [{"id": "string", "name": "string"}] }`
- **Error Response (409):** `{ "error": "Username already taken" }`

---

## 2. User Management (`/api/users`, `/api/roles`, `/api/permissions`)

These endpoints require specific permissions (e.g., `users:view`, `roles:manage`).

### GET /users
Retrieves a list of all users and their assigned roles.
- **Method:** `GET`
- **Success Response (200):** `[{ "id": "string", "username": "string", "roles": [{"id": "string", "name": "string"}] }]`

### POST /users
Creates a new user.
- **Method:** `POST`
- **Body:** `{ "username": "string", "password": "string", "roleIds": ["string"] }`
- **Success Response (201):** `{ "id": "string", "username": "string", "roles": [{"id": "string", "name": "string"}] }`

### GET /users/{userId}
Retrieves a single user's details, including their roles.
- **Method:** `GET`
- **URL Params:** `userId: string`
- **Success Response (200):** `{ "id": "string", "username": "string", "roles": [{"id": "string", "name": "string"}] }`

### PUT /users/{userId}
Updates an existing user's details, password, or roles.
- **Method:** `PUT`
- **URL Params:** `userId: string`
- **Body (Partial):** `{ "username": "string", "password": "string", "roleIds": ["string"] }` (Password is optional; if omitted, it is not changed).
- **Success Response (200):** `{ "id": "string", "username": "string", "roles": [{"id": "string", "name": "string"}] }`

### DELETE /users/{userId}
Deletes a user. The last administrator cannot be deleted.
- **Method:** `DELETE`
- **URL Params:** `userId: string`
- **Success Response (200):** `{ "message": "User deleted successfully" }`

### GET /roles
Retrieves all available roles with user and permission counts.
- **Method:** `GET`
- **Success Response (200):** `[{ "id": "string", "name": "string", "description": "string", "isSystemRole": boolean, "userCount": number, "permissionCount": number }]`

### POST /roles
Creates a new role.
- **Method:** `POST`
- **Body:** `{ "name": "string", "description": "string", "permissionIds": ["string"] }`
- **Success Response (201):** `{ "id": "string", "name": "string", ... }`

### GET /roles/{roleId}
Retrieves a single role with its assigned permission IDs.
- **Method:** `GET`
- **URL Params:** `roleId: string`
- **Success Response (200):** `{ "id": "string", "name": "string", "permissionIds": ["string"] }`

### PUT /roles/{roleId}
Updates a role's name, description, and permissions.
- **Method:** `PUT`
- **URL Params:** `roleId: string`
- **Body:** `{ "name": "string", "description": "string", "permissionIds": ["string"] }`
- **Success Response (200):** `{ "id": "string", "name": "string", "permissionIds": ["string"] }`

### DELETE /roles/{roleId}
Deletes a role.
- **Method:** `DELETE`
- **URL Params:** `roleId: string`
- **Success Response (200):** `{ "message": "Role deleted successfully." }`

### GET /permissions
Retrieves all available permissions, grouped by category.
- **Method:** `GET`
- **Success Response (200):** `{ "Category One": [Permission], "Category Two": [Permission] }`

---

## 3. API Token Management (`/api/users/{userId}/tokens`)

### GET /
Retrieves metadata for all API tokens for a specific user.
- **Method:** `GET`
- **Success Response (200):** `[{ "id": "string", "name": "string", "createdAt": "string", "lastUsedAt": "string" }]`

### POST /
Creates a new API token for a user.
- **Method:** `POST`
- **Body:** `{ "name": "string" }`
- **Success Response (201):** `{ "id": "string", "name": "string", "createdAt": "string", "token": "string" }` (The `token` value is only returned once.)

### DELETE /{tokenId}
Revokes (deletes) an API token.
- **Method:** `DELETE`
- **URL Params:** `tokenId: string`
- **Success Response (200):** `{ "message": "API token revoked successfully." }`

---

## 4. Structural Entities (`/api/codex-structure`)

These endpoints manage the core data structures of the application.

### Model Groups (`/model-groups`)
- **`GET /`**: List all model groups.
- **`POST /`**: Create a new model group. (Requires `admin:manage_model_groups` permission).
  - Body: `{ "name": "string", "description": "string" }`
- **`GET /{groupId}`**: Get details of a single model group.
- **`PUT /{groupId}`**: Update a model group. (Requires `admin:manage_model_groups` permission).
  - Body: `{ "name": "string", "description": "string" }`
- **`DELETE /{groupId}`**: Delete a model group. Models within are reassigned to 'Default'. (Requires `admin:manage_model_groups` permission).

### Models (`/models`)
- **`GET /`**: List all models the user has permission to view, with their properties.
- **`POST /`**: Create a new model. (Requires `models:manage` permission).
  - Body: A `Model` object (see `src/lib/types.ts`).
- **`GET /{modelId}`**: Get a single model's structure. (Requires `model:view:{modelId}` or `models:manage` permission).
- **`PUT /{modelId}`**: Update a model's structure. (Requires `model:manage:{modelId}` or `models:manage` permission).
  - Body: A partial `Model` object.
- **`DELETE /{modelId}`**: Delete a model and all its associated objects and properties. (Requires `model:manage:{modelId}` or `models:manage` permission).

### Workflows (`/workflows`)
- **`GET /`**: List all workflows. (Requires `admin:manage_workflows` permission).
- **`POST /`**: Create a new workflow. (Requires `admin:manage_workflows` permission).
  - Body: A `WorkflowWithDetails` object.
- **`GET /{workflowId}`**: Get a single workflow. (Requires `admin:manage_workflows` permission).
- **`PUT /{workflowId}`**: Update a workflow. (Requires `admin:manage_workflows` permission).
- **`DELETE /{workflowId}`**: Delete a workflow. (Requires `admin:manage_workflows` permission).

### Validation Rulesets (`/validation-rulesets`)
- **`GET /`**: List all validation rulesets. (Authenticated).
- **`POST /`**: Create a new validation ruleset. (Requires `admin:manage_validation_rules` permission).
  - Body: `{ "name": "string", "description": "string", "regexPattern": "string" }`
- **`GET /{rulesetId}`**: Get a single validation ruleset. (Authenticated).
- **`PUT /{rulesetId}`**: Update a validation ruleset. (Requires `admin:manage_validation_rules` permission).
- **`DELETE /{rulesetId}`**: Delete a validation ruleset. (Requires `admin:manage_validation_rules` permission).

### Wizards (`/wizards`)
- **`GET /`**: List all wizards. (Requires `admin:manage_wizards` permission).
- **`POST /`**: Create a new wizard. (Requires `admin:manage_wizards` permission).
- **`GET /{wizardId}`**: Get a single wizard. (Requires `admin:manage_wizards` permission).
- **`PUT /{wizardId}`**: Update a wizard. (Requires `admin:manage_wizards` permission).
- **`DELETE /{wizardId}`**: Delete a wizard. (Requires `admin:manage_wizards` permission).
- **`POST /{wizardId}/start`**: Initiates a new transactional wizard run. Returns a unique `runId`. (Authenticated).
- **`GET /run/{runId}`**: Retrieves the current state of a wizard run, including the wizard definition and data for completed steps. (Owner only).
- **`POST /run/{runId}`**: Submits data for the current step of a wizard run. Handles the final transactional commit on the last step. (Owner only).
- **`DELETE /run/{runId}`**: Abandons an in-progress wizard run, rolling back any temporary data. (Owner only).
- **`GET /runs`**: Retrieves a list of the current user's in-progress wizard runs.

---

## 5. Data Objects (`/api/codex-structure/models/{modelId}/objects`)

These endpoints manage the data instances for each model.

- **`GET /`**: List all data objects for a specific `{modelId}`. (Requires `model:view:{modelId}` permission).
  - Query Params: `?includeDeleted=true` to include soft-deleted items.
- **`POST /`**: Create a new data object for a `{modelId}`. (Requires `model:create:{modelId}` permission).
  - Body: `{ "id": "string", ...dynamicProperties }`
- **`GET /{objectId}`**: Get a single data object. (Requires `model:view:{modelId}` permission).
- **`PUT /{objectId}`**: Update a data object. (Requires `model:edit:{modelId}` or ownership with `objects:edit_own` permission).
  - Body: `{ ...dynamicProperties }`
- **`DELETE /{objectId}`**: Soft-deletes a data object. (Requires `model:delete:{modelId}` or ownership with `objects:delete_own` permission).
- **`POST /{objectId}/restore`**: Restores a soft-deleted object. (Requires `model:edit:{modelId}` or ownership with `objects:edit_own` permission).
- **`POST /batch-update`**: Update multiple objects at once. (Requires `model:edit:{modelId}` permission).
  - Body: `{ "objectIds": ["string"], "propertyName": "string", "propertyType": "string", "newValue": any }`

---

## 6. File Uploads (`/api/codex-structure`)

- **`POST /upload-image`**: Uploads an image file.
  - **Body:** `FormData` containing `file`, `modelId`, `objectId`, `propertyName`.
  - **Success Response (200):** `{ "success": true, "url": "/uploads/..." }`
- **`POST /upload-file`**: Uploads a generic file.
  - **Body:** `FormData` containing `file`, `modelId`, `objectId`, `propertyName`.
  - **Success Response (200):** `{ "success": true, "url": "/uploads/...", "name": "original-filename.ext" }`

### Serving Files (`/uploads`)
- **`GET /uploads/[...slug]`**: Serves a previously uploaded file. The `slug` corresponds to the path generated during upload (e.g., `modelId/objectId/propertyName/filename.ext`).

---

## 7. Changelogs (`/api`)

- **`GET /structural-changelog`**: Retrieves a paginated list of all structural changes (e.g., model edits, group creation). (Requires `admin:view_activity_log` permission).
  - **Query Params:** `page`, `limit`, `category`, `userId`, `dateStart`, `dateEnd`.
- **`GET /codex-structure/objects/{objectId}/changelog`**: Retrieves the complete change history for a single data object.
- **`POST /codex-structure/objects/{objectId}/changelog/{changelogEntryId}/revert`**: Reverts a data object to the state before a specific change was made. (Requires `objects:revert` permission).

---

## 8. Dashboard (`/api/codex-structure/dashboards`)

- **`GET /user-dashboard`**: Retrieves the current user's dashboard configuration.
- **`POST /user-dashboard`**: Saves or updates the current user's dashboard configuration.
  - **Body:** A `Dashboard` object (see `src/lib/types.ts`).

---

## 9. Import/Export (`/api/codex-structure`)

- **`GET /export/model/{modelId}`**: Exports a model's structure and all its data objects as a JSON file. (Requires `models:import_export` permission).
- **`POST /import/model`**: Imports a model and its data from a JSON file. (Requires `models:import_export` permission).
  - **Body:** `{ "fileContent": "stringified-json-from-export" }`

