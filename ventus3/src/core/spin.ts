// src/core/spin.ts
// Banco de perguntas SPIN: 6 escalas × 4 categorías (Situação, Problema,
// Implicação, Necessidade). Alimenta el editor de escala y el chip de
// preguntas sugeridas del Plano do Dia.
//
// Las preguntas son del negocio real de Ventapel Brasil: fechamento de caixas
// com fita gomada (Better Pack), fita Venom com evidência de violação,
// E-comfill + resmas para preenchimento, E-Combag e contrato de manutenção.
// Vocabulario de planta: caixa violada, retrabalho, expedição, DOCA, sinistro,
// avaria, carga roubada, laudo, devolução, ergonomia do operador, LER/DORT.
//
// Regla de oro que las atraviesa a todas: los NÚMEROS los dice el cliente.
// Ninguna pregunta afirma un porcentaje, un ahorro ni un benchmark nuestro.

import type { ScaleKey, SpinCategory, SpinQuestion } from './types'

export const SPIN_CATEGORY_LABELS: Readonly<Record<SpinCategory, string>> = {
  situacao: 'Situação',
  problema: 'Problema',
  implicacao: 'Implicação',
  necessidade: 'Necessidade de solução',
}

export const SPIN_CATEGORY_HINTS: Readonly<Record<SpinCategory, string>> = {
  situacao: 'Levantar fatos e números da operação. Poucas e rápidas: cansam.',
  problema: 'Fazer o cliente DIZER o problema. Se você disser, não conta.',
  implicacao: 'Ligar o problema a dinheiro, tempo, risco e gente. É onde a dor sobe.',
  necessidade: 'Fazer o cliente descrever o benefício com as palavras dele.',
}

/** Helper interno para escribir el banco sin repetir la escala en cada línea. */
function bloco(
  scale: ScaleKey,
  porCategoria: Record<SpinCategory, readonly string[]>,
): SpinQuestion[] {
  const out: SpinQuestion[] = []
  for (const categoria of ['situacao', 'problema', 'implicacao', 'necessidade'] as const) {
    for (const text of porCategoria[categoria]) out.push({ scale, category: categoria, text })
  }
  return out
}

/* ── DOR — o cliente admite e quantifica o problema ──────────────────────── */

const DOR = bloco('dor', {
  situacao: [
    'Quantas caixas vocês fecham por mês nessa planta, somando todos os turnos?',
    'Como é o fechamento hoje: fita plástica na máquina, fita manual, grampo ou uma mistura?',
    'Quantas pessoas trabalham na expedição por turno e quantas ficam só fechando caixa?',
    'Quantos tipos de caixa vocês usam e qual é a mais pesada que sai daqui?',
    'De cada 10 cargas que saem, quantas vão para transportadora terceirizada e quantas são frota própria?',
    'Vocês têm um número de avaria e violação por mês, ou isso hoje é sentimento?',
    'Quem é o dono do indicador de avaria aqui dentro: expedição, qualidade ou logística?',
    'Quantos rolos de fita vocês consomem por mês e quantas voltas o operador dá por caixa?',
  ],
  problema: [
    'Com que frequência chega uma reclamação de caixa aberta ou violada no destino?',
    'Já aconteceu de a caixa chegar fechada mas com produto faltando dentro?',
    'Quando dá problema em trânsito, vocês conseguem provar onde a caixa foi aberta, ou vira palavra contra palavra?',
    'A fita descola em caixa suja, empoeirada ou com resíduo de graxa aqui dentro?',
    'O operador reclama de dor no punho ou no ombro no fim do turno de fechamento?',
    'Em pico de demanda, o fechamento vira gargalo na expedição ou dá conta?',
    'Vocês já tiveram carga roubada ou desviada em rota, com caixa reembalada no caminho?',
    'Quantas devoluções por mês têm como causa raiz a embalagem, e não o produto?',
  ],
  implicacao: [
    'Quando uma caixa chega violada, quanto custa esse pedido inteiro entre frete, reposição e mão de obra?',
    'Se você multiplicar essas ocorrências pelos 12 meses, quanto isso representa no orçamento da logística?',
    'Quem para de fazer o trabalho dele para tratar uma ocorrência dessas, e quantas horas leva?',
    'Quando não dá pra provar a violação, quem come o prejuízo: vocês ou a transportadora?',
    'O que uma caixa violada faz com esse cliente específico na próxima cotação?',
    'Se o operador de fechamento sair de licença por LER, quanto tempo você leva para repor e treinar?',
    'Essa taxa de avaria tem impacto no seu contrato de seguro ou no prêmio que vocês pagam?',
    'Se a expedição atrasa por causa do fechamento, o que acontece com a janela de coleta da transportadora?',
  ],
  necessidade: [
    'Se a caixa chegasse com evidência clara de que ninguém abriu, o que muda na sua discussão com a transportadora?',
    'Quanto valeria para vocês cortar pela metade as ocorrências de violação em trânsito?',
    'Se o operador fechasse a caixa com uma tira só, sem esforço, o que isso libera na sua expedição?',
    'Como seria o seu indicador de avaria daqui a seis meses se esse problema estivesse resolvido?',
    'O que você precisaria ver funcionando aqui dentro para dizer que valeu a pena?',
    'Se a gente eliminasse o retrabalho de reembalar, para onde você realoca essas horas?',
    'Que número você levaria para a diretoria como prova de que a mudança deu certo?',
    'Se resolvermos violação e ergonomia no mesmo movimento, isso vira prioridade deste trimestre?',
  ],
})

/* ── PODER — chegar em quem assina ───────────────────────────────────────── */

const PODER = bloco('poder', {
  situacao: [
    'Como funciona a aprovação de uma mudança de material de embalagem aqui: quem propõe e quem assina?',
    'Uma compra desse porte passa por comitê, por alçada do gerente ou vai direto para a diretoria?',
    'Quem além de você seria impactado no dia a dia se a gente trocasse o fechamento?',
    'Existe um orçamento de melhoria de processo já aprovado para este ano ou entra como CAPEX novo?',
    'Qualidade e segurança do trabalho participam dessa decisão ou só validam depois?',
    'Quem foi que decidiu o fornecedor de fita atual, e faz quanto tempo?',
    'Tem alguém em compras que já acompanha o tema de embalagem?',
    'Se esse projeto avançar, quem seria o padrinho dele dentro da empresa?',
  ],
  problema: [
    'Já teve algum projeto parecido que travou aqui? Onde ele parou?',
    'O que costuma acontecer quando uma boa ideia chega na diretoria sem número fechado?',
    'Você tem autonomia para autorizar um teste na planta ou isso também precisa subir?',
    'Quem aqui dentro tende a ser contra mudar o processo de expedição, e por quê?',
    'Quando o assunto é embalagem, a decisão costuma ser de custo unitário ou de custo total?',
    'Alguma vez vocês compraram uma solução e ela não foi usada porque a operação não comprou a ideia?',
    'A diretoria já sabe o tamanho do problema de avaria, ou esse número não chega lá?',
    'Faltou algo da última vez para conseguir a aprovação: dado, prazo, comparativo?',
  ],
  implicacao: [
    'Se a gente montar isso só com você e depois a diretoria pedir outros números, quanto tempo perdemos?',
    'Quem na diretoria sente hoje a dor do frete e da avaria no bolso dele?',
    'Se o projeto for apresentado por você com o número pronto, como isso te posiciona internamente?',
    'O que a diretoria de vocês precisa ver para tirar isso da fila de espera?',
    'Se compras entrar só no final, o que costuma acontecer com o prazo?',
    'Quem sofre o risco se uma carga roubada virar processo: você, o cliente ou a diretoria?',
    'Se a decisão escorregar para o ano que vem, quantas ocorrências vocês acumulam até lá?',
    'Sem o dono do orçamento na sala, o que garante que este assunto não morre?',
  ],
  necessidade: [
    'Faz sentido a gente apresentar isso junto para quem assina, com você conduzindo?',
    'O que você precisaria de mim para levar esse tema à diretoria com segurança?',
    'Se eu preparar o material com os SEUS números, você consegue abrir 30 minutos com o decisor?',
    'Quem mais deveria estar nessa conversa para a gente não ter que repetir tudo depois?',
    'Prefere que eu fale com compras agora ou depois de a operação validar o teste?',
    'Qual é o melhor formato para essa apresentação aqui dentro: uma página, planilha ou visita à planta?',
    'Se a diretoria aprovar o piloto, quem seria o responsável por tocar do lado de vocês?',
    'Podemos combinar uma data para essa reunião com o decisor antes de eu montar o material?',
  ],
})

/* ── VISÃO — o cliente enxerga a solução na operação DELE ────────────────── */

const VISAO = bloco('visao', {
  situacao: [
    'Você já viu uma máquina de fita gomada ativada por água funcionando em uma planta?',
    'Qual é a dimensão e o peso médio da caixa que mais sai daqui?',
    'Onde ficariam os postos de fechamento na sua linha atual?',
    'Qual é o layout da expedição: esteira contínua, bancada fixa ou posto móvel?',
    'Vocês já testaram algum material alternativo de fechamento antes?',
    'Como vocês fazem hoje o preenchimento do vazio da caixa: plástico bolha, flow pack, papel?',
    'Existe alguma exigência de sustentabilidade dos seus clientes sobre a embalagem?',
    'A caixa de vocês é lisa, kraft, com verniz ou reciclada?',
  ],
  problema: [
    'Quando vocês avaliaram alternativas, o que ficou faltando para enxergar o ganho?',
    'A comparação que te fizeram era de preço do rolo ou de custo por caixa fechada?',
    'Você conseguiria hoje explicar para a diretoria por que a fita plástica sai mais cara no total?',
    'O que te faz duvidar de que uma tira só de fita gomada segure a sua caixa mais pesada?',
    'Alguém já te mostrou como fica a evidência de violação numa caixa com Venom?',
    'A operação acredita que dá para fechar mais rápido, ou acha que vai atrasar?',
    'O que aconteceu da última vez que um fornecedor prometeu redução de avaria?',
    'Sem ver rodando na SUA caixa, você compraria essa ideia?',
  ],
  implicacao: [
    'Se a comparação continuar sendo preço por rolo, que decisão vocês vão tomar?',
    'O que muda na sua conversa interna quando o número for custo por caixa e não custo do material?',
    'Se a operação não enxergar o ganho, o que acontece com a adesão no chão de fábrica?',
    'Sem uma referência de um caso parecido, quanto risco a diretoria vai enxergar nisso?',
    'Se o teste for feito com uma caixa que não é a sua, o resultado convence alguém aqui?',
    'O que acontece com o projeto se o operador achar a máquina difícil de usar?',
    'Se ninguém aqui viu a evidência de violação funcionando, como vocês vão usar isso numa disputa?',
    'Quanto tempo vocês perdem toda vez que uma ideia entra sem prova na planta?',
  ],
  necessidade: [
    'Se eu trouxer a máquina e fecharmos a SUA caixa, com o SEU produto dentro, isso resolve a dúvida?',
    'Que caso de outra operação do seu setor te ajudaria a enxergar isso mais rápido?',
    'Como você gostaria de ver isso: demo na sua planta, visita a um cliente nosso ou vídeo do processo?',
    'O que precisa aparecer na demo para você dizer "é isso"?',
    'Quer que eu monte a comparação em custo por caixa com os seus volumes?',
    'Se eu documentar o que conversamos e te mandar por escrito, você valida com a sua equipe?',
    'Quem da operação precisa ver a demo junto com você para não ter ruído depois?',
    'Faz sentido a gente desenhar como ficaria o posto de fechamento no seu layout atual?',
  ],
})

/* ── VALOR — o ROI com números do cliente ────────────────────────────────── */

const VALOR = bloco('valor', {
  situacao: [
    'Qual é o custo hoje de fechar uma caixa, somando fita, mão de obra e retrabalho?',
    'Quantos metros de fita plástica vocês usam por caixa em média, contando as voltas?',
    'Qual é o custo médio do produto que vai dentro da caixa que mais viaja?',
    'Quanto vocês pagaram no último ano em reposição por avaria e violação?',
    'Qual é o custo de uma devolução completa para vocês, com frete de retorno?',
    'Vocês conseguem separar do orçamento quanto é material de embalagem e quanto é perda?',
    'Qual é a meta de redução de custo logístico da área para este ano?',
    'Vocês têm um valor de referência para hora de operador na expedição?',
  ],
  problema: [
    'Esse custo de perda aparece em algum relatório ou fica diluído em "outros"?',
    'Vocês conseguem provar para o seguro o que foi violação e o que foi erro de separação?',
    'Quando a transportadora recusa o sinistro, quanto sobra para vocês pagarem?',
    'Se eu te perguntar quanto custou a embalagem ruim no ano passado, você tem esse número na mão?',
    'A economia de comprar fita mais barata está compensando as ocorrências?',
    'Qual é o pedido mais caro que vocês perderam por causa de embalagem?',
    'Quanto tempo a equipe gasta por mês tratando reclamação de avaria?',
    'Existe algum cliente de vocês que já aplicou multa ou desconto por causa disso?',
  ],
  implicacao: [
    'Se a gente reduzir as ocorrências, esse dinheiro volta para o seu orçamento ou para o da logística?',
    'O que a diretoria faria com esse valor liberado por ano?',
    'Se o custo por caixa cair, quanto isso representa no seu preço final por pedido?',
    'Além do dinheiro direto, quanto vale para vocês parar de brigar com transportadora?',
    'Se as horas de retrabalho sumirem, quantas pessoas você realoca para outra função?',
    'Qual é o impacto no prazo de entrega se a expedição parar de refazer caixa?',
    'Se conseguirmos comprovar violação com evidência, isso muda a sua negociação de frete?',
    'O que vale mais para o negócio de vocês: economizar no material ou parar de perder carga?',
  ],
  necessidade: [
    'Me passa três números — volume mensal, custo atual por caixa e % de perda — e eu monto a conta com você?',
    'Que resultado o teste precisa mostrar para vocês considerarem o investimento pago?',
    'Em quanto tempo de payback esse projeto passa direto na sua alçada?',
    'Quer que a gente meça o antes e o depois na mesma linha, com a mesma equipe?',
    'Quais critérios você e o decisor usariam para dizer que o piloto foi um sucesso?',
    'Se o número fechar como a gente estima, o que impede a decisão?',
    'Prefere que eu construa o business case com o seu financeiro junto?',
    'Você confirma por escrito as conclusões da análise se elas baterem com o que mediram aqui?',
  ],
})

/* ── CONTROLE — o processo documentado e acordado ────────────────────────── */

const CONTROLE = bloco('controle', {
  situacao: [
    'Como vocês costumam conduzir uma avaliação de fornecedor novo: quantas etapas e quanto tempo?',
    'Quem acompanha o teste na planta no dia a dia?',
    'Qual é o prazo que vocês têm em mente para decidir isso?',
    'Vocês precisam de homologação técnica ou de qualidade antes de comprar?',
    'Existe algum período do ano em que a planta não aceita mudança de processo?',
    'Como vocês registram o resultado de um piloto: relatório, planilha, ata?',
    'Quem assina o aceite técnico no final da avaliação?',
    'Vocês já têm um plano de avaliação padrão ou eu proponho um?',
  ],
  problema: [
    'O que costuma atrasar uma avaliação dessas aqui dentro?',
    'Já aconteceu de um teste terminar e ninguém formalizar o resultado?',
    'Quando não tem plano escrito, quem decide se o teste passou ou não?',
    'O que acontece se a pessoa que acompanha o teste sair de férias no meio?',
    'Vocês tiveram algum caso em que o piloto deu certo e a compra não saiu?',
    'Hoje as nossas conversas ficam registradas em algum lugar do lado de vocês?',
    'Falta algum critério combinado para a gente não discutir o resultado depois?',
    'Quem garante que o operador vai ser treinado antes do teste começar?',
  ],
  implicacao: [
    'Sem critérios acordados antes, o que impede a discussão de virar opinião no final?',
    'Se o teste não tiver data de fim, quanto tempo ele fica rodando sem decisão?',
    'Quanto custa para vocês um piloto que não conclui nada?',
    'Se o decisor não aprovar o plano antes, o que acontece com o resultado depois?',
    'O que a sua equipe perde de credibilidade se o projeto arrastar sem fechamento?',
    'Sem o aceite formal, como vocês justificam a compra para auditoria?',
    'Se a gente não combinar quem mede o quê, quem vai ser responsabilizado por um número ruim?',
    'Quanto atraso vocês acumulam quando cada área entra na conversa em momentos diferentes?',
  ],
  necessidade: [
    'Faz sentido eu mandar um plano de avaliação com etapas, datas e responsáveis para vocês ajustarem?',
    'Que critérios você quer ver nesse plano para ele ser aprovado de primeira?',
    'Podemos combinar hoje a data de início e a data de leitura do resultado?',
    'Quem do seu lado assina o plano para a gente travar as datas?',
    'Prefere que eu envie o resumo de cada conversa por e-mail para virar registro?',
    'Se eu documentar o combinado e você validar, a gente evita retrabalho no final?',
    'Quais números vocês querem medir durante o teste, para eu já preparar a coleta?',
    'Depois do resultado aprovado, qual é o próximo passo formal do lado de vocês?',
  ],
})

/* ── COMPRAS — o processo comercial até o pagamento ──────────────────────── */

const COMPRAS = bloco('compras', {
  situacao: [
    'Como funciona o processo de compras de vocês depois que a área técnica aprova?',
    'Vocês trabalham com cotação de três fornecedores ou com contrato direto?',
    'Qual é o prazo de pagamento padrão de vocês?',
    'Existe homologação de fornecedor com documentação, certidões e cadastro?',
    'A compra de máquina e a de consumível seguem o mesmo fluxo ou são fluxos diferentes?',
    'Quem é o comprador responsável por embalagem e qual o nome dele?',
    'Vocês fecham contrato anual de fornecimento ou compram por demanda?',
    'Tem alguma janela de orçamento no ano em que essa compra fica mais fácil?',
  ],
  problema: [
    'O que costuma emperrar entre a aprovação técnica e a emissão do pedido?',
    'Compras costuma tentar renegociar depois de tudo acordado com a operação?',
    'Já teve caso de projeto aprovado que ficou parado esperando cadastro de fornecedor?',
    'O critério de compras aqui é menor preço ou custo total? Como isso é medido?',
    'Quanto tempo em média leva do aceite técnico até o pedido de compra sair?',
    'Existe alguma restrição contratual com o fornecedor atual de fita?',
    'Quem tem alçada para aprovar o valor que a gente está falando?',
    'Já aconteceu de o pedido sair e a entrega travar por documentação?',
  ],
  implicacao: [
    'Se o processo de cadastro levar 30 dias, o que acontece com a data de início do projeto?',
    'Se compras cortar por preço unitário, o que vocês perdem do ganho que medimos no teste?',
    'Quanto custa cada mês de atraso, considerando as ocorrências que continuam acontecendo?',
    'Se o pedido não sair neste orçamento, quando é a próxima janela?',
    'Se a gente não alinhar compras agora, quanto retrabalho a sua equipe vai ter no final?',
    'O que acontece com a sua meta se esse projeto escorregar para o próximo trimestre?',
    'Sem contrato de fornecimento, como vocês garantem preço e abastecimento no pico?',
    'Se faltar consumível na planta, qual é o impacto na expedição no mesmo dia?',
  ],
  necessidade: [
    'Podemos adiantar o cadastro de fornecedor em paralelo ao teste para não perder tempo?',
    'O que compras precisa receber de mim para não travar depois: certidões, ficha técnica, proposta formal?',
    'Faz sentido eu apresentar a proposta já no formato que compras espera?',
    'Vocês preferem contrato anual com preço travado ou compra por demanda?',
    'Que condição comercial resolveria para vocês sem virar desconto de preço?',
    'Quer que eu inclua o serviço de manutenção no mesmo contrato?',
    'Se eu enviar a proposta esta semana, quando ela entra na pauta de compras?',
    'O que falta para eu poder considerar isso fechado do lado de vocês?',
  ],
})

/** Banco completo: 6 escalas × 4 categorías × 8 preguntas = 192. */
export const SPIN_QUESTIONS: readonly SpinQuestion[] = [
  ...DOR,
  ...PODER,
  ...VISAO,
  ...VALOR,
  ...CONTROLE,
  ...COMPRAS,
]

/* ── Consultas ───────────────────────────────────────────────────────────── */

/** Preguntas de una escala, opcionalmente filtradas por categoría. */
export function questionsForScale(scale: ScaleKey, category?: SpinCategory): SpinQuestion[] {
  return SPIN_QUESTIONS.filter(
    (q) => q.scale === scale && (category === undefined || q.category === category),
  )
}

/**
 * Categoría que hay que trabajar según dónde está la escala.
 *
 *   0-1  situação    — todavía no sabemos nada de la operación
 *   2-4  problema    — el cliente tiene que DECIR el problema
 *   5-7  implicação  — atar el problema a dinero, tiempo y riesgo
 *   8-10 necessidade — que él describa el beneficio con sus palabras
 *
 * Es la secuencia SPIN clásica mapeada a los niveles del PPVVCC: subir de 3 a
 * 4 se logra preguntando por el problema, no por la solución.
 */
export function categoriaParaNivel(currentLevel: number): SpinCategory {
  const n = Math.max(0, Math.min(10, Math.floor(currentLevel)))
  if (n <= 1) return 'situacao'
  if (n <= 4) return 'problema'
  if (n <= 7) return 'implicacao'
  return 'necessidade'
}

/**
 * Preguntas para mover una escala DESDE su nivel actual AL siguiente,
 * excluyendo las ya usadas (que se persisten por oportunidad).
 *
 * Rellena con la categoría contigua si la principal ya se agotó: el vendedor
 * nunca se queda sin nada que preguntar en la puerta de la planta.
 */
export function questionsToAdvance(
  scale: ScaleKey,
  currentLevel: number,
  usedTexts: readonly string[],
  limit = 3,
): SpinQuestion[] {
  const usadas = new Set(usedTexts.map((t) => t.trim()))
  const principal = categoriaParaNivel(currentLevel)
  const ordem: SpinCategory[] = ['situacao', 'problema', 'implicacao', 'necessidade']
  const idx = ordem.indexOf(principal)

  // Prioridad: la categoría que toca, después la siguiente, después la anterior.
  const prioridade: SpinCategory[] = [principal]
  const seguinte = ordem[idx + 1]
  const anterior = ordem[idx - 1]
  if (seguinte) prioridade.push(seguinte)
  if (anterior) prioridade.push(anterior)
  for (const c of ordem) if (!prioridade.includes(c)) prioridade.push(c)

  const out: SpinQuestion[] = []
  for (const cat of prioridade) {
    for (const q of questionsForScale(scale, cat)) {
      if (out.length >= limit) return out
      if (usadas.has(q.text.trim())) continue
      out.push(q)
    }
  }
  return out
}

/** Solo el texto de las preguntas — lo que va en PlannedAction.perguntasSugeridas. */
export function textosParaAvancar(
  scale: ScaleKey,
  currentLevel: number,
  usedTexts: readonly string[] = [],
  limit = 3,
): string[] {
  return questionsToAdvance(scale, currentLevel, usedTexts, limit).map((q) => q.text)
}
