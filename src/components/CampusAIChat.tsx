import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Copy,
  Database,
  FileText,
  Globe,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch, getAuthHeaders, setSessionToken } from '../lib/api';
import { AuthUser, ChatMessage, ConversationItem, SupportedLanguage } from '../types/campus';
import { ConfirmDialog, useToast } from './ToastProvider';

interface CampusAIChatProps {
  user: AuthUser;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  compact?: boolean;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
}

export function CampusAIChat({
  user,
  language,
  onLanguageChange,
  compact = false,
  initialPrompt,
  onConsumeInitialPrompt,
}: CampusAIChatProps) {
  const { notify } = useToast();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const roleSuggestions =
    user.roleName === 'student'
      ? [
          'How many classes can I miss while maintaining the required attendance?',
          'Summarize my current exam marks and strongest/weakest subjects.',
          'What does the condonation policy say for 65%–74% attendance?',
          'Explain B+ Tree indexing with an example and practice question.',
        ]
      : user.roleName === 'teacher'
        ? [
            'Which students in my assigned classes have attendance below 75%?',
            'Summarize performance in my assigned subjects based on published marks.',
            'What is the Continuous Internal Evaluation weightage in the handbook?',
          ]
        : [
            'Give me an institutional overview across all departments.',
            'Summarize student counts, average CGPA, and fee collection status.',
            'What are the placement eligibility rules in our policy document?',
          ];

  const loadConversations = async (q = searchQuery) => {
    try {
      const data = await apiFetch<{ conversations: ConversationItem[] }>(
        `/api/ai/conversations?q=${encodeURIComponent(q)}`
      );
      setConversations(data.conversations);
      return data.conversations;
    } catch {
      return [];
    }
  };

  const loadMessages = async (convId: number) => {
    setLoadingMessages(true);
    try {
      const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/ai/conversations/${convId}/messages`);
      setMessages(data.messages);
    } catch (err: any) {
      notify(err.message || 'Failed to load messages', 'error');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadConversations('');
  }, []);

  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
      onConsumeInitialPrompt?.();
    }
  }, [initialPrompt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSelectConversation = (id: number) => {
    setActiveConvId(id);
    loadMessages(id);
  };

  const handleNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput('');
    setAttachedFile(null);
  };

  const handleDeleteConversation = async () => {
    if (!deleteTargetId) return;
    try {
      await apiFetch(`/api/ai/conversations/${deleteTargetId}`, { method: 'DELETE' });
      if (activeConvId === deleteTargetId) {
        setActiveConvId(null);
        setMessages([]);
      }
      setDeleteTargetId(null);
      loadConversations();
      notify('Conversation deleted.', 'info');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const sendMessage = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;

    setSending(true);
    const optimisticUser: ChatMessage = {
      id: Date.now(),
      conversation_id: activeConvId || 0,
      role: 'user',
      content: attachedFile ? `${trimmed}\n\n[Attached file: ${attachedFile.name}]` : trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('prompt', trimmed);
      formData.append('language', language);
      if (activeConvId) formData.append('conversationId', String(activeConvId));
      if (attachedFile) formData.append('file', attachedFile);

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: formData,
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setSessionToken(null);
        }
        throw new Error(data?.error || 'AI request failed.');
      }

      setActiveConvId(data.conversationId);
      setMessages((prev) => [...prev, data.message]);
      setAttachedFile(null);
      loadConversations();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        notify('Generation stopped.', 'info');
      } else {
        notify(err.message || 'Failed to get AI response.', 'error');
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            conversation_id: activeConvId || 0,
            role: 'assistant',
            content: `Unable to complete request: ${err.message}`,
            classification: 'ERROR',
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleRetryLast = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      sendMessage(lastUser.content.replace(/\n\n\[Attached file: .*\]$/, ''));
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    notify('Copied response to clipboard.', 'success');
  };

  const classificationLabel = (c?: string) => {
    if (!c) return null;
    const map: Record<string, string> = {
      GENERAL_AI: 'General AI Knowledge',
      PERSONAL_STUDENT_DATA: 'Verified Student Database',
      TEACHER_ACADEMIC_DATA: 'Verified Faculty Database',
      ADMINISTRATIVE_DATA: 'Institutional Analytics',
      COLLEGE_DOCUMENTS: 'Official College Documents (RAG)',
      MIXED_QUERY: 'Combined Database + Documents + AI',
      ERROR: 'Error',
    };
    return map[c] || c;
  };

  return (
    <div
      className={`flex overflow-hidden rounded-xl border border-slate-200 bg-white ${
        compact ? 'h-full min-h-[480px]' : 'h-[calc(100vh-7.5rem)] min-h-[560px]'
      }`}
    >
      {/* Left Conversation History Sidebar (Hidden in compact drawer mode on small screens) */}
      {!compact && (
        <aside className="hidden md:flex w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
          <div className="p-3 border-b border-slate-200 space-y-2.5">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </button>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="search"
                aria-label="Search conversations"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  loadConversations(e.target.value);
                }}
                placeholder="Search conversations..."
                className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">No saved conversations yet.</p>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
                    activeConvId === c.id ? 'bg-blue-50 text-blue-900 font-medium' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectConversation(c.id)}
                    className="flex-1 truncate text-left pr-2"
                  >
                    {c.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetId(c.id)}
                    aria-label={`Delete conversation ${c.title}`}
                    className="opacity-60 hover:opacity-100 text-slate-500 hover:text-red-600 p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {/* Main Chat Pane */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Chat Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-blue-700" />
            <div>
              <h2 className="text-sm font-semibold text-slate-950">CampusGPT Assistant</h2>
              <p className="text-[11px] text-slate-500">
                Grounded in {user.roleName} records · Institutional PDFs · Gemini AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {compact && (
              <button
                type="button"
                onClick={handleNewChat}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                New Chat
              </button>
            )}
            <label htmlFor="ai-lang-select" className="sr-only">
              AI Response Language
            </label>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <Globe className="h-3.5 w-3.5 text-slate-500" />
              <select
                id="ai-lang-select"
                value={language}
                onChange={(e) => onLanguageChange(e.target.value as SupportedLanguage)}
                className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
              >
                <option value="English">English</option>
                <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
                <option value="Hindi">हिन्दी (Hindi)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/50">
          {loadingMessages ? (
            <div className="space-y-4">
              <div className="h-16 w-2/3 animate-pulse rounded-lg bg-slate-200" />
              <div className="h-28 w-5/6 animate-pulse rounded-lg bg-slate-200" />
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto max-w-2xl py-6">
              <h3 className="font-display text-lg font-semibold text-slate-950">
                Ask anything — academic, personal, or institutional
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                CampusGPT automatically determines whether to query your verified database records, search official handbooks, or provide general study and programming help.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {roleSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage(s)}
                    className="rounded-lg border border-slate-200 bg-white p-3.5 text-left text-xs font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[90%] sm:max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                    m.role === 'user'
                      ? 'bg-blue-700 text-white'
                      : 'border border-slate-200 bg-white text-slate-900'
                  }`}
                >
                  {m.role === 'assistant' && m.classification && (
                    <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 text-[11px] font-medium text-slate-500">
                      <Database className="h-3 w-3 text-blue-700" />
                      <span>{classificationLabel(m.classification)}</span>
                    </div>
                  )}

                  {m.role === 'user' ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  ) : (
                    <div className="campus-markdown max-w-none text-slate-800">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  )}

                  {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-2.5">
                      <p className="text-[11px] font-semibold text-slate-600">Sources &amp; Grounding</p>
                      <ul className="mt-1 space-y-1">
                        {m.citations.map((cit, idx) => (
                          <li key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-500">
                            <FileText className="h-3 w-3 mt-0.5 shrink-0 text-blue-700" />
                            <span>
                              <strong className="text-slate-700">{cit.title}:</strong> {cit.detail}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {m.role === 'assistant' && (
                    <div className="mt-2.5 flex items-center gap-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                      <button
                        type="button"
                        onClick={() => handleCopy(m.content)}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={handleRetryLast}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex items-start">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 flex items-center gap-3">
                <span>Analyzing query, checking authorized sources, and generating response in {language}...</span>
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="border-t border-slate-200 bg-white p-3 sm:p-4"
        >
          {attachedFile && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-900">
              <Paperclip className="h-3.5 w-3.5" />
              <span className="truncate max-w-xs">{attachedFile.name}</span>
              <button
                type="button"
                aria-label="Remove attached file"
                onClick={() => setAttachedFile(null)}
                className="text-blue-700 hover:text-blue-950"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.py,.js,.ts,.c,.cpp,.java"
              className="hidden"
              onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach PDF or study file"
              title="Attach PDF or text file"
              className="rounded-lg border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <label htmlFor="campus-ai-input" className="sr-only">
              Ask CampusGPT
            </label>
            <textarea
              id="campus-ai-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder={`Ask CampusGPT in ${language} (e.g., attendance, marks, regulations, or coding)...`}
              className="flex-1 resize-none rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />

            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Delete conversation"
        description="This permanently removes the chat history for this thread from your account."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConversation}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
