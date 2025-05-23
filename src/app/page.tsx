
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useData } from "@/contexts/data-context";
import { DatabaseZap, ListChecks, Users, BarChart3 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";

export default function HomePage() {
  const { models, objects, isReady } = useData();

  if (!isReady) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-primary animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-lg text-muted-foreground">Loading data...</p>
        </div>
      </div>
    );
  }

  const totalObjects = Object.values(objects).reduce((sum, arr) => sum + arr.length, 0);

  const chartData = models.map(model => ({
    name: model.name,
    count: objects[model.id]?.length || 0,
  }));

  const chartConfig = {
    count: {
      label: "Objects",
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig;

  return (
    <div className="container mx-auto py-8">
      <header className="mb-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-primary">CodexStructure</h1>
        <p className="mt-4 text-xl text-muted-foreground">
          Your flexible solution for dynamic data definition and management.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
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
              New to CodexStructure? Start by defining your first data model.
            </p>
            <Link href="/models" passHref className="mt-4 block">
              <Button variant="default" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Create a Model</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {models.length > 0 && (
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 mb-16">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">Object Distribution by Model</CardTitle>
            </div>
            <CardDescription>Number of data objects currently stored in each model.</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.some(d => d.count > 0) ? (
              <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
                <BarChart 
                  accessibilityLayer 
                  data={chartData} 
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                  barGap={8}
                  barCategoryGap="20%"
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    interval={0}
                    className="text-xs fill-muted-foreground"
                  />
                  <YAxis 
                    tickLine={false} 
                    axisLine={false} 
                    tickMargin={10} 
                    allowDecimals={false} 
                    className="text-xs fill-muted-foreground"
                  />
                  <RechartsTooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    content={<ChartTooltipContent indicator="dot" />}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="var(--color-count)" 
                    radius={[4, 4, 0, 0]} 
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="text-center py-10">
                <ListChecks size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No data objects found in any model yet. 
                  <Link href="/models" className="text-primary hover:underline ml-1">Create some data</Link> to see it visualized here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <section className="p-8 bg-card rounded-lg shadow-md">
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
