
# CodexStructure API Documentation

This document provides an overview of the API endpoints available in the CodexStructure application.

## Base URL

All API routes are prefixed with `/api`. For example, the login route is `/api/auth/login`.

## Authentication

Most endpoints require the user to be authenticated. Authentication is handled via an HTTP-only session cookie named `codex_structure_session`, which is set upon successful login. Requests made from the frontend will automatically include this cookie.

For development purposes, a `DEBUG_MODE` flag can be enabled in `src/lib/auth.ts`. When active, all API requests are treated as if they are coming from a mock administrator user, bypassing login requirements.

---

## 1. Authentication (`/api/auth`)

### POST /login
Logs in a user.
- **Method:** `POST`
- **Body:** `{ "username": "string", "password": "string" }`
- **Success Response (200):** `{ "id": "string", "username": "string", "role": "user" | "administrator" }`
- **Error Response (401):** `{ "error": "Invalid username or password" }`

### POST /logout
Logs out the current user by clearing their session cookie.
- **Method:** `POST`
- **Success Response (200):** `{ "message": "Logged out successfully" }`

### GET /me
Retrieves the currently authenticated user's information.
- **Method:** `GET`
- **Success Response (200):** `{ "id": "string", "username": "string", "role": "user" | "administrator" }` or `null` if not authenticated.

### POST /register
Registers a new user. The first user to register becomes an 'administrator'.
- **Method:** `POST`
- **Body:** `{ "username": "string", "password": "string" }`
- **Success Response (201):** `{ "id": "string", "username": "string", "role": "user" | "administrator" }`
- **Error Response (409):** `{ "error": "Username already taken" }`

---

## 2. User Management (`/api/users`)

All endpoints in this section require `administrator` role.

### GET /users
Retrieves a list of all users.
- **Method:** `GET`
- **Success Response (200):** `[{ "id": "string", "username": "string", "role": "user" | "administrator" }]`

### POST /users
Creates a new user.
- **Method:** `POST`
- **Body:** `{ "username": "string", "password": "string", "role": "user" | "administrator" }`
- **Success Response (201):** `{ "id": "string", "username": "string", "role": "user" | "administrator" }`

### PUT /users/{userId}
Updates an existing user.
- **Method:** `PUT`
- **URL Params:** `userId: string`
- **Body (Partial):** `{ "username": "string", "password": "string", "role": "user" | "administrator" }` (Password is optional; if omitted, it is not changed).
- **Success Response (200):** `{ "id": "string", "username": "string", "role": "user" | "administrator" }`

### DELETE /users/{userId}
Deletes a user. The last administrator cannot be deleted.
- **Method:** `DELETE`
- **URL Params:** `userId: string`
- **Success Response (200):** `{ "message": "User deleted successfully" }`

---

## 3. Structural Entities (`/api/codex-structure`)

These endpoints manage the core data structures of the application. Most write operations require `administrator` role.

### Model Groups (`/model-groups`)

- **`GET /`**: List all model groups.
- **`POST /`**: Create a new model group. (Admin)
  - Body: `{ "name": "string", "description": "string" }`
- **`GET /{groupId}`**: Get details of a single model group.
- **`PUT /{groupId}`**: Update a model group. (Admin)
  - Body: `{ "name": "string", "description": "string" }`
- **`DELETE /{groupId}`**: Delete a model group. Models within are reassigned to 'Default'. (Admin)

### Models (`/models`)

- **`GET /`**: List all models with their properties.
- **`POST /`**: Create a new model. (Admin)
  - Body: A `Model` object (see `src/lib/types.ts`).
- **`GET /{modelId}`**: Get a single model's structure.
- **`PUT /{modelId}`**: Update a model's structure. (Admin)
  - Body: A partial `Model` object.
- **`DELETE /{modelId}`**: Delete a model and all its associated objects and properties. (Admin)

### Workflows (`/workflows`)

- **`GET /`**: List all workflows. (Admin)
- **`POST /`**: Create a new workflow. (Admin)
  - Body: A `WorkflowWithDetails` object.
- **`GET /{workflowId}`**: Get a single workflow. (Admin)
- **`PUT /{workflowId}`**: Update a workflow. (Admin)
- **`DELETE /{workflowId}`**: Delete a workflow. (Admin)

### Validation Rulesets (`/validation-rulesets`)

- **`GET /`**: List all validation rulesets. (Authenticated)
- **`POST /`**: Create a new validation ruleset. (Admin)
  - Body: `{ "name": "string", "description": "string", "regexPattern": "string" }`
- **`GET /{rulesetId}`**: Get a single validation ruleset. (Authenticated)
- **`PUT /{rulesetId}`**: Update a validation ruleset. (Admin)
- **`DELETE /{rulesetId}`**: Delete a validation ruleset. (Admin)

---

## 4. Data Objects (`/api/codex-structure/models/{modelId}/objects`)

These endpoints manage the data instances for each model.

- **`GET /`**: List all data objects for a specific `{modelId}`.
  - Query Params: `?includeDeleted=true` to include soft-deleted items.
- **`POST /`**: Create a new data object for a `{modelId}`.
  - Body: `{ "id": "string", ...dynamicProperties }`
- **`GET /{objectId}`**: Get a single data object.
- **`PUT /{objectId}`**: Update a data object.
  - Body: `{ ...dynamicProperties }`
- **`DELETE /{objectId}`**: Soft-deletes a data object.
- **`POST /{objectId}/restore`**: Restores a soft-deleted object.
- **`POST /batch-update`**: Update multiple objects at once.
  - Body: `{ "objectIds": ["string"], "propertyName": "string", "propertyType": "string", "newValue": any }`

---

## 5. File Uploads (`/api/codex-structure`)

- **`POST /upload-image`**: Uploads an image file.
  - **Body:** `FormData` containing `file`, `modelId`, `objectId`, `propertyName`.
  - **Success Response (200):** `{ "success": true, "url": "/uploads/..." }`
- **`POST /upload-file`**: Uploads a generic file.
  - **Body:** `FormData` containing `file`, `modelId`, `objectId`, `propertyName`.
  - **Success Response (200):** `{ "success": true, "url": "/uploads/...", "name": "original-filename.ext" }`

### Serving Files (`/uploads`)
- **`GET /uploads/[...slug]`**: Serves a previously uploaded file. The `slug` corresponds to the path generated during upload (e.g., `modelId/objectId/propertyName/filename.ext`).

---

## 6. Changelogs (`/api`)

- **`GET /structural-changelog`**: Retrieves a paginated list of all structural changes (e.g., model edits, group creation). (Admin)
  - **Query Params:** `page`, `limit`, `entityType`, `entityId`, `userId`, `action`, `dateStart`, `dateEnd`.
- **`GET /codex-structure/objects/{objectId}/changelog`**: Retrieves the complete change history for a single data object.
- **`POST /codex-structure/objects/{objectId}/changelog/{changelogEntryId}/revert`**: Reverts a data object to the state before a specific change was made. (Admin)

---

## 7. Dashboard (`/api/codex-structure/dashboards`)

- **`GET /user-dashboard`**: Retrieves the current user's dashboard configuration.
- **`POST /user-dashboard`**: Saves or updates the current user's dashboard configuration.
  - **Body:** A `Dashboard` object (see `src/lib/types.ts`).

---

## 8. Import/Export (`/api/codex-structure`)

- **`GET /export/model/{modelId}`**: Exports a model's structure and all its data objects as a JSON file. (Admin)
- **`POST /import/model`**: Imports a model and its data from a JSON file. (Admin)
  - **Body:** `{ "fileContent": "stringified-json-from-export" }`
