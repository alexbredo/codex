
# CodexStructure (Firebase Studio Project)

CodexStructure is a web application designed to empower users to dynamically define and manage their own data structures (models) and the data objects associated with them. It provides tools for creating models with various property types (text, numbers, dates, relationships), organizing these models into logical groups (model groups), and performing CRUD (Create, Read, Update, Delete) operations on data entries through adaptive forms. The goal is to offer a flexible, user-centric way to build custom information systems without requiring deep database expertise, supported by an internal API for programmatic data access.

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v18.x or later recommended)
- npm (usually comes with Node.js) or yarn

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
    This command will download and install all the necessary packages defined in `package.json`, including Next.js, React, Tailwind CSS, ShadCN UI components, SQLite, and DND Kit.

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

    The application uses an SQLite database (`database.sqlite`) which will be created in the project's root directory when the application first tries to access it (usually on the first page load that triggers a data fetch).

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

## Project Structure Highlights

-   `src/app/`: Contains the Next.js App Router pages and layouts.
    -   `src/app/api/`: Backend API routes for CRUD operations (e.g., under `src/app/api/codex-structure/`).
-   `src/components/`: Reusable React components, including ShadCN UI components and custom application components.
-   `src/contexts/`: React Context providers (e.g., `DataContext`).
-   `src/lib/`: Utility functions, database setup (`db.ts`), and type definitions (`types.ts`).
-   `src/ai/`: Genkit related files for AI functionalities.
-   `database.sqlite`: The SQLite database file (will be created automatically).

## Building for Production

To create a production build, run:
```bash
npm run build
```
And to start the production server:
```bash
npm run start
```

Enjoy exploring and developing CodexStructure!
