"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Brain, Database, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchHealth, type HealthResponse } from "@/lib/api";

function StatusBadge({ status }: { status: string }) {
  const variant = status === "ok" ? "default" : "destructive";
  return <Badge variant={variant}>{status}</Badge>;
}

export default function Home() {
  const { data, isLoading, error } = useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
  });

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <Brain className="h-8 w-8" />
          <h1 className="text-3xl font-bold">Distill</h1>
          <span className="text-muted-foreground">
            Personal AI Knowledge & Digest System
          </span>
        </div>

        {isLoading && (
          <p className="text-muted-foreground">Connecting to backend...</p>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">
                Backend unavailable. Start FastAPI on localhost:8000.
              </p>
            </CardContent>
          </Card>
        )}

        {data && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Activity className="h-4 w-4" />
                <CardTitle className="text-sm font-medium">System</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBadge status={data.status} />
                <p className="mt-2 text-sm text-muted-foreground">
                  Environment: {data.env}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Database className="h-4 w-4" />
                <CardTitle className="text-sm font-medium">Database</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBadge status={data.db} />
                <p className="mt-2 text-sm text-muted-foreground">
                  Neon Postgres
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Cpu className="h-4 w-4" />
                <CardTitle className="text-sm font-medium">Ollama</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusBadge status={data.ollama} />
                <p className="mt-2 text-sm text-muted-foreground">
                  Local AI models
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
