'use client';

import type { AgentState, ReceivedMessage } from '@livekit/components-react';
import { AnimatePresence } from 'motion/react';
import type { ComponentProps } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { AgentChatIndicator } from '@/components/agents-ui/agent-chat-indicator';
import { cn } from '@/lib/utils';

export interface AgentChatTranscriptProps extends ComponentProps<'div'> {
  agentState?: AgentState;
  messages?: ReceivedMessage[];
  className?: string;
}

function getAttachment(
  message: ReceivedMessage
): {
  kind: 'image' | 'file';
  name?: string;
  mimeType?: string;
  url?: string;
} | null {
  const attributes = message.attributes ?? {};
  const kind = attributes.attachmentKind;
  if (kind !== 'image' && kind !== 'file') {
    return null;
  }

  return {
    kind,
    name: attributes.attachmentName,
    mimeType: attributes.attachmentMimeType,
    url: attributes.attachmentUrl,
  };
}

function TranscriptRow({ message }: { message: ReceivedMessage }) {
  const isLocal = Boolean(message.from?.isLocal);
  const attachment = getAttachment(message);
  const visibleText = message.message?.trim() ?? '';

  return (
    <div
      className={cn(
        'flex w-full',
        isLocal ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[88%] space-y-2',
          isLocal
            ? 'rounded-[20px] bg-black/[0.045] px-4 py-3 text-black'
            : 'px-1 py-1 text-black'
        )}
      >
        {attachment?.kind === 'image' && attachment.url ? (
          <div>
            <img
              src={attachment.url}
              alt="Uploaded image"
              className="max-h-44 rounded-2xl border border-black/8 object-cover"
            />
          </div>
        ) : null}

        {visibleText ? (
          <div
            className={cn(
              'whitespace-pre-wrap text-[15px] leading-7',
              isLocal ? 'text-black' : 'text-black'
            )}
          >
            {visibleText}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AgentChatTranscript({
  agentState,
  messages = [],
  className,
  ...props
}: AgentChatTranscriptProps) {
  const chatMessages = messages.filter((message) => message.type === 'chatMessage');

  return (
    <Conversation className={className} {...props}>
      <ConversationContent className="gap-5 px-1 py-2">
        {chatMessages.map((message) => (
          <TranscriptRow key={message.id} message={message} />
        ))}
        <AnimatePresence>
          {agentState === 'thinking' && chatMessages.length > 0 ? (
            <AgentChatIndicator size="sm" />
          ) : null}
        </AnimatePresence>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
