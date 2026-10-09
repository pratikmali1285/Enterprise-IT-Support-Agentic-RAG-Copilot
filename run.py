# from app.services.ingestion import load_file, chunk_documents
# from pathlib import Path
# from app.rag.vectorstore import add_documents

# docs = load_file(Path("data/sample_kb/company_it_handbook.md"))
# docs = chunk_documents(docs)

# add_documents(docs)
# print(len(docs))

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8080, reload=True)