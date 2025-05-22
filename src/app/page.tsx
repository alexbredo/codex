'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useData } from "@/contexts/data-context";
import { DatabaseZap, ListChecks, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const { models, objects, isReady } = useData();

  if (!isReady) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-lg text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  const totalObjects = Object.values(objects).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="container mx-auto py-8">
      <header className="mb-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-primary">Dynamic Data Weaver</h1>
        <p className="mt-4 text-xl text-muted-foreground">
          Your flexible solution for dynamic data management.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Models Defined</CardTitle>
            <DatabaseZap className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{models.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Custom data structures available.
            </p>
            <Link href="/models" passHref className="mt-4 block">
              <Button variant="outline" className="w-full">Manage Models</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Data Objects</CardTitle>
            <ListChecks className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{totalObjects}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Instances across all models.
            </p>
             <Link href="/models" passHref className="mt-4 block">
               <Button variant="outline" className="w-full">View Objects by Model</Button>
            </Link>
          </CardContent>
        </Card>
        
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Getting Started</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              New to Dynamic Data Weaver? Start by defining your first data model.
            </p>
            <Link href="/models" passHref className="mt-4 block">
              <Button variant="default" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Create a Model</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <section className="mt-16 p-8 bg-card rounded-lg shadow-md">
        <h2 className="text-3xl font-semibold text-center mb-6 text-primary">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8 text-center">
          <div>
            <DatabaseZap size={48} className="mx-auto mb-4 text-accent" />
            <h3 className="text-xl font-medium mb-2">1. Define Models</h3>
            <p className="text-muted-foreground">Create flexible data structures with various property types like text, numbers, dates, and relationships.</p>
          </div>
          <div>
            <ListChecks size={48} className="mx-auto mb-4 text-accent" />
            <h3 className="text-xl font-medium mb-2">2. Manage Data</h3>
            <p className="text-muted-foreground">Perform CRUD operations on your data objects using adaptive forms tailored to your models.</p>
          </div>
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 text-accent lucide lucide-search-code"><path d="m9 9-2 2 2 2"/><path d="m13 13 2-2-2-2"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <h3 className="text-xl font-medium mb-2">3. Search & Filter</h3>
            <p className="text-muted-foreground">Efficiently find the information you need with intuitive search and filtering capabilities.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
