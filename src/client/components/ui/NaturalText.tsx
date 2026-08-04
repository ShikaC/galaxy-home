import type { ReactNode } from "react"

const chineseSegmenter = new Intl.Segmenter("zh-CN", { granularity: "word" })
const hanCharacter = /\p{Script=Han}/u
const maxPhraseLength = 7
const phraseBoundaries = new Set(["在", "与", "和", "及", "的", "且"])

export function NaturalText({ text }: { readonly text: string }) {
  const nodes: ReactNode[] = []
  let phrase = ""
  let phraseStart = 0
  const appendPhrase = () => {
    if (!phrase) return
    nodes.push(
      <span className="text-phrase" key={`phrase-${phraseStart}`}>
        {phrase}
      </span>,
    )
    phrase = ""
  }

  for (const part of chineseSegmenter.segment(text)) {
    const isChineseWord = part.isWordLike && hanCharacter.test(part.segment)
    if (!isChineseWord) {
      appendPhrase()
      nodes.push(<span key={`separator-${part.index}`}>{part.segment}</span>)
      continue
    }
    if (phrase && Array.from(phrase + part.segment).length > maxPhraseLength) appendPhrase()
    if (!phrase) phraseStart = part.index
    phrase += part.segment
    if (phraseBoundaries.has(part.segment)) appendPhrase()
  }
  appendPhrase()
  return nodes
}
