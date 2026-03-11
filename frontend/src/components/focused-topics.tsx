"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchFocusedTopics, updateFocusedTopics } from "@/lib/api";
import { useSettings, textSizeClasses } from "@/lib/settings-store";

export function FocusedTopics() {
  const [input, setInput] = useState("");
  const queryClient = useQueryClient();
  const textSize = useSettings((s) => s.textSize);
  const ts = textSizeClasses[textSize];

  const { data, isLoading } = useQuery({
    queryKey: ["focusedTopics"],
    queryFn: fetchFocusedTopics,
  });

  const mutation = useMutation({
    mutationFn: updateFocusedTopics,
    onSuccess: (result) => {
      queryClient.setQueryData(["focusedTopics"], result);
    },
  });

  const topics = data?.topics ?? [];

  const addTopic = () => {
    const trimmed = input.trim();
    if (!trimmed || topics.includes(trimmed)) return;
    mutation.mutate([...topics, trimmed]);
    setInput("");
  };

  const removeTopic = (topic: string) => {
    mutation.mutate(topics.filter((t) => t !== topic));
  };

  if (isLoading) return null;

  return (
    <section>
      <h2 className={`mb-3 font-medium ${ts.heading}`}>Focused Topics</h2>
      <p className={`mb-3 ${ts.small} text-muted-foreground`}>
        Topics you care about. Summaries and tags will emphasize these when relevant.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="e.g. agentic commerce"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTopic();
            }
          }}
          className={`flex-1 rounded-md border border-input bg-background px-3 py-1.5 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ts.body}`}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={addTopic}
          disabled={!input.trim() || topics.length >= 20}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {topics.map((topic) => (
            <Badge key={topic} variant="secondary" className="gap-1 pr-1">
              {topic}
              <button
                onClick={() => removeTopic(topic)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {topics.length >= 20 && (
        <p className={`mt-2 ${ts.small} text-muted-foreground`}>
          Maximum of 20 topics reached.
        </p>
      )}
    </section>
  );
}
