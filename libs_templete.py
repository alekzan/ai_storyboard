##### VERY BASIC LIBRARIES #####
import os
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

load_dotenv()
key = os.getenv("OPENAI_API_KEY")
print("OpenAI API Key: ✅ SET" if key else "OpenAI API Key: ❌ MISSING")

os.getenv("LANGCHAIN_API_KEY")


##### BASIC LIBRARIES #####

from langchain_core.messages import (
    HumanMessage,
    SystemMessage,
    AIMessage,
    ToolMessage,
)
from langgraph.graph import StateGraph, MessagesState, END, START
from langgraph.prebuilt import ToolNode, tools_condition, create_react_agent
from langgraph.graph.message import add_messages
import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.checkpoint.memory import InMemorySaver
from typing import Any, Dict, List, Annotated, TypedDict
from typing_extensions import TypedDict
from pydantic import BaseModel, Field

load_dotenv()
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"
os.environ["LANGCHAIN_PROJECT"] = "XXXXXXX Project"

print("🔐 API Keys Status:")
print(f"OpenAI API Key set:     {'✅' if os.environ.get('OPENAI_API_KEY') and os.environ['OPENAI_API_KEY'] != 'YOUR_OPENAI_API_KEY' else '❌ MISSING'}")
print(f"GROQ API Key set:       {'✅' if os.environ.get('GROQ_API_KEY') and os.environ['GROQ_API_KEY'] != 'YOUR_GROQ_API_KEY' else '❌ MISSING'}")
print(f"Google API Key set:     {'✅' if os.environ.get('GOOGLE_API_KEY') and os.environ['GOOGLE_API_KEY'] != 'YOUR_GOOGLE_API_KEY' else '❌ MISSING'}")
print(f"LangChain API Key set:  {'✅' if os.environ.get('LANGCHAIN_API_KEY') and os.environ['LANGCHAIN_API_KEY'] != 'YOUR_LANGCHAIN_API_KEY' else '❌ MISSING'}")


########### MAIN LIBRARIES ###########
# 🔧 General
import os
import os.path
from datetime import datetime
from dotenv import load_dotenv

###################### LANGCHAIN ######################
# 🧠 LLM & tools
from langchain.chat_models import init_chat_model # NEW!
# llm = init_chat_model(model='openai:gpt-4.1')
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

# 🧰 Langchain Tools
from langchain.tools.retriever import create_retriever_tool
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_tavily import TavilySearch

# 🛠️ Core LangChain Messages
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage

# MCP
from langchain_mcp_adapters.client import MultiServerMCPClient # Example above 👇

###################### RAG ######################
# 📂 Loaders
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, WebBaseLoader

# 🧩 Splitters
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 📑 Vector Store
from pinecone import Pinecone
from langchain_pinecone import PineconeVectorStore
from langchain_community.vectorstores import Chroma
from langchain_core.vectorstores import InMemoryVectorStore

# Embeddings
from langchain_openai import OpenAIEmbeddings

from langchain.tools.retriever import create_retriever_tool

###################### LANGGRAPH ######################
# 🧠 LangGraph and States
from langgraph.graph import MessagesState, StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
from langgraph_supervisor import create_supervisor
from langgraph.types import Command

#ToolNode(tools)

###################### MEMORY ######################
import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore



###################### TYPE DEFINITIONS ######################
from typing import Any, Dict, List, Annotated, Literal
from typing_extensions import TypedDict
from pydantic import BaseModel, Field

########### DRAW THE GRAPH ###########
# 🖼️ Graph visualizatio
from IPython.display import Image, display
#display(Image(NAME_OF_THE_GRAPH.get_graph().draw_mermaid_png())) 


# Load environment variables
load_dotenv()
# OS environment variables
# Set environment variables (if needed by your environment)
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
GROQ_API_KEY = os.environ["GROQ_API_KEY"]
LANGCHAIN_API_KEY = os.environ["LANGCHAIN_API_KEY"]
PINECONE_API_KEY = os.environ["PINECONE_API_KEY"]
TAVILY_API_KEY = os.environ["TAVILY_API_KEY"]
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"
os.environ["LANGCHAIN_PROJECT"] = "XXXXXXX Project"

tool = TavilySearch(max_results=2)



###################### RAG IMPLEMENTATION ######################

pdf_loader = PyPDFLoader("PATH/TO/PDF_DOC.PDF")
docs = pdf_loader.load()

text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
split_docs = text_splitter.split_documents(docs)

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vector_store = InMemoryVectorStore.from_documents(split_docs, embeddings)
general_retriever=vector_store.as_retriever(search_kwargs={"k": 2})
# create retriever tool


# MEMORY SETTING
checkpointer = InMemorySaver()
# compile graph or app with checkpointer

import uuid
def generate_thread_id():
    return str(uuid.uuid4())[:4]

new_thread_id = generate_thread_id()

config = {"configurable": {"thread_id":new_thread_id}}
print(config)

app = "YOUR_APP".compile()
for chunk in app.stream(
    {'messages': [
        HumanMessage(content="hi there"),
    ]},
    config,
):
    print(chunk)
    print("*"*10)
    
# MCP Usage. ⚠️ USE WITH create_react_agent
client = MultiServerMCPClient(
    {
        "math": {
            "command": "python",
            # Replace with absolute path to your math_server.py file
            "args": ["/path/to/math_server.py"],
            "transport": "stdio",
        },
        "weather": {
            # Ensure you start your weather server on port 8000
            "url": "http://localhost:8000/mcp",
            "transport": "streamable_http",
        }
    }
)
tools = client.get_tools()
def greet(name, age):
    print(f"Hello {name}, you are {age} years old")
