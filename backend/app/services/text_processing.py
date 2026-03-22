"""Text chunking and clustering — no LLM needed."""

import numpy as np
from langchain_text_splitters import RecursiveCharacterTextSplitter

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=150,
    length_function=len,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def chunk_text(text: str) -> list[str]:
    """Split text into ~1000 char chunks with 150 char overlap."""
    if not text or not text.strip():
        return []
    return _splitter.split_text(text)


def cluster_by_similarity(
    embeddings: list[list[float]], threshold: float = 0.88
) -> list[list[int]]:
    """Returns list of clusters, each cluster is a list of indices."""
    if not embeddings:
        return []

    n = len(embeddings)
    if n == 1:
        return [[0]]

    vecs = np.array(embeddings)
    # Normalize for cosine similarity
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1
    vecs = vecs / norms

    # Cosine similarity matrix
    sim_matrix = vecs @ vecs.T

    assigned = set()
    clusters = []

    for i in range(n):
        if i in assigned:
            continue
        cluster = [i]
        assigned.add(i)
        for j in range(i + 1, n):
            if j in assigned:
                continue
            if sim_matrix[i][j] >= threshold:
                cluster.append(j)
                assigned.add(j)
        clusters.append(cluster)

    return clusters
