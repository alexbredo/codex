
# CodexStructure (Firebase Studio Project)

CodexStructure is a web application designed to empower users to dynamically define and manage their own data structures (models) and the data objects associated with them. It provides tools for creating models with various property types (text, numbers, dates, relationships), organizing these models into logical groups (model groups), and performing CRUD (Create, Read, Update, Delete) operations on data entries through adaptive forms. The goal is to offer a flexible, user-centric way to build custom information systems without requiring deep database expertise, supported by an internal API for programmatic data access.

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v18.x or v20.x recommended)
- npm (usually comes with Node.js) or yarn
- Docker (optional, for containerized deployment)

## Getting Started

Follow these steps to get the project up and running on your local machine:

1.  **Clone the Repository (if applicable)**
    If you've downloaded this project as a ZIP or are cloning it from a Git repository, navigate to the project's root directory in your terminal.

2.  **Install Dependencies**
    Open your terminal in the project's root directory and run one of the following commands, depending on your preferred package manager:

    Using npm:
    ```bash
    npm install
    ```

    Using yarn:
    ```bash
    yarn install
    ```
    This command will download and install all the necessary packages defined in `package.json`.

3.  **Run the Development Server**
    Once the dependencies are installed, you can start the Next.js development server:

    Using npm:
    ```bash
    npm run dev
    ```

    Using yarn:
    ```bash
    yarn dev
    ```
    This will start the application, typically on `http://localhost:9002` (as configured in `package.json`). The terminal will display the exact address. Open this address in your web browser to see the application.

    The application uses an SQLite database. In development, it will create a `database.sqlite` file inside a `data/` directory in your project root (i.e., `data/database.sqlite`) when the application first tries to access it.

4.  **Running Genkit (Optional for AI Features)**
    If you plan to work with or develop Generative AI features using Genkit (which is part of this project's stack), you'll need to run the Genkit development server separately.
    Open a new terminal window/tab, navigate to the project root, and run:

    ```bash
    npm run genkit:dev
    ```
    Or for watching changes:
    ```bash
    npm run genkit:watch
    ```
    The Genkit server typically runs on `http://localhost:4000` and provides an interface for inspecting and debugging Genkit flows.

## Running with Docker (Production)

This project includes a `Dockerfile` to build a production-ready container.

1.  **Build the Docker Image**:
    Navigate to the project's root directory in your terminal and run:
    ```bash
    docker build -t codex-structure .
    ```
    Replace `codex-structure` with your desired image name.

2.  **Run the Docker Container**:
    To run the container and persist the SQLite database outside of it, you'll need to mount a volume.

    *   Create a directory on your host machine to store the database, for example:
        ```bash
        mkdir -p ./codex_data
        ```
    *   Run the Docker container with a volume mount:
        ```bash
        docker run -d -p 3000:3000 \
          -v "$(pwd)/codex_data:/app/data" \
          --name codex-structure-app \
          codex-structure
        ```
        -   `-d`: Run in detached mode.
        -   `-p 3000:3000`: Maps port 3000 on your host to port 3000 in the container (Next.js production server defaults to port 3000).
        -   `-v "$(pwd)/codex_data:/app/data"`: This is crucial. It mounts the `codex_data` directory from your current working directory on the host to `/app/data` inside the container. The application is configured to store its `database.sqlite` file within this `/app/data` directory.
        -   `--name codex-structure-app`: Assigns a name to the running container for easier management.
        -   `codex-structure`: The name of the image you built.

    The application will then be accessible at `http://localhost:3000`. The `database.sqlite` file will be created and stored in your host's `./codex_data` directory.

## Project Structure Highlights

-   `src/app/`: Contains the Next.js App Router pages and layouts.
    -   `src/app/api/codex-structure/`: Backend API routes for CRUD operations.
-   `src/components/`: Reusable React components, including ShadCN UI components and custom application components.
-   `src/contexts/`: React Context providers (e.g., `DataContext`).
-   `src/lib/`: Utility functions, database setup (`db.ts`), and type definitions (`types.ts`).
-   `src/ai/`: Genkit related files for AI functionalities.
-   `data/database.sqlite`: The SQLite database file (will be created automatically in local dev, or in the mounted volume for Docker).
-   `Dockerfile`: For building the production Docker image.
-   `.dockerignore`: Specifies files to exclude from the Docker build context.

## Building for Production (Manual, without Docker)

To create a production build without Docker, run:
```bash
npm run build
```
And to start the production server (this will also create `data/database.sqlite` if it doesn't exist):
```bash
npm run start
```
The application will typically be available at `http://localhost:3000`.

Enjoy exploring and developing CodexStructure!
