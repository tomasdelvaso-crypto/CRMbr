// src/screens/Ajustes/SecaoAvisos.tsx
// AVISOS — el presupuesto diario existe para que los avisos vuelvan a valer.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS DOS DECISIONES DE ESTA SECCIÓN
// ══════════════════════════════════════════════════════════════════════════
//
// 1. EL PERMISO SE PIDE DESDE UN TAP. SIEMPRE. En iOS 16.4+ el prompt de
//    notificaciones exige gesto del usuario y que la app esté instalada en la
//    pantalla de inicio. Disparado desde un `useEffect` no aparece ningún
//    diálogo, la promesa resuelve 'denied' y el permiso queda quemado PARA
//    SIEMPRE: Safari no vuelve a preguntar. Por eso hay un botón, y por eso
//    cuando falta instalar la app se dice eso en vez de mostrar el botón.
//
// 2. EL TECHO SUGERIDO ES 4 Y ESTÁ ARGUMENTADO EN PANTALLA. El dispatcher del
//    v2 llegó a mandar 17 avisos por día y la tasa de lectura de las 4.521
//    notificaciones históricas es 0,0 %. Un aviso que nadie lee no es un
//    aviso: es ruido con costo de batería. Se puede subir el número, pero
//    subiéndolo se lee lo que eso significa.

import { BellRing, Check, Smartphone, X } from 'lucide-react'
import {
  CANAIS_DE_AVISO,
  ORCAMENTO_MAXIMO,
  ORCAMENTO_RECOMENDADO,
  ROTULO_DO_CANAL,
  TIPOS_DE_AVISO,
  pedirPermissaoDeAviso,
  permissaoDeAviso,
  precisaInstalarParaAviso,
  useDefinirPrefsDeAviso,
  usePrefsDeAviso,
  type CanalDeAviso,
  type TipoDeAviso,
} from '@/data'
import { BlocoDePush } from '@/push/BlocoDePush'
import { Button, Chip, NumberField, Skeleton, Switch, toast } from '@/ui'
import { useState } from 'react'
import { Divisor, Secao } from './Secao'

export function SecaoAvisos({ vendorName }: { vendorName: string | null }) {
  const consulta = usePrefsDeAviso(vendorName)
  const definir = useDefinirPrefsDeAviso()
  // El permiso se lee en render (es síncrono) y se refresca sólo cuando la
  // persona toca el botón. Nada de sondearlo en un intervalo.
  const [permissao, setPermissao] = useState(permissaoDeAviso)

  if (consulta.isPending || !consulta.data) {
    return (
      <Secao titulo="Avisos" proposito="Quantos empurrões por dia, e de que tipo.">
        <Skeleton variant="lista" count={3} />
      </Secao>
    )
  }

  const prefs = consulta.data
  const salvar = (mudancas: Parameters<typeof definir.mutate>[0]['mudancas']): void => {
    if (!vendorName) return
    definir.mutate({ vendor: vendorName, mudancas })
  }

  const alternarCanal = (canal: CanalDeAviso): void => {
    const tem = prefs.canais.includes(canal)
    salvar({ canais: tem ? prefs.canais.filter((c) => c !== canal) : [...prefs.canais, canal] })
  }

  const alternarTipo = (tipo: TipoDeAviso): void => {
    const mutado = prefs.tiposMutados.includes(tipo)
    salvar({
      tiposMutados: mutado
        ? prefs.tiposMutados.filter((t) => t !== tipo)
        : [...prefs.tiposMutados, tipo],
    })
  }

  return (
    <Secao
      titulo="Avisos"
      icone={<BellRing size={14} aria-hidden />}
      proposito="Quantos empurrões por dia, quando, por onde e de que tipo."
    >
      <BlocoDePermissao permissao={permissao} aoPedir={setPermissao} />

      {/* Registro deste aparelho no Web Push. Sempre a partir de um toque:
          num useEffect o iOS recusa em silêncio e queima a permissão. */}
      <div className="mt-3">
        <BlocoDePush />
      </div>

      <Divisor />

      <NumberField
        label="Máximo por dia"
        sufixo="avisos"
        value={prefs.orcamentoDiario}
        onChange={(v) => salvar({ orcamentoDiario: v })}
        min={0}
        max={ORCAMENTO_MAXIMO}
        referencia={`recomendado ${ORCAMENTO_RECOMENDADO}`}
        hint={
          prefs.orcamentoDiario > ORCAMENTO_RECOMENDADO
            ? 'Acima de 4 por dia a leitura despenca — no v2 chegamos a 17 diários e ninguém abre mais nenhum. O que passa do teto vira resumo do dia seguinte.'
            : 'O que não couber no teto não some: vira uma linha no resumo do dia seguinte.'
        }
      />

      <Divisor />

      <fieldset>
        <legend className="text-sm font-medium text-fg-muted">Silêncio</legend>
        <div className="mt-2 flex gap-3">
          <NumberField
            className="flex-1"
            label="Das"
            sufixo="h"
            value={prefs.silencioDe}
            onChange={(v) => salvar({ silencioDe: v })}
            min={12}
            max={23}
          />
          <NumberField
            className="flex-1"
            label="Até"
            sufixo="h"
            value={prefs.silencioAte}
            onChange={(v) => salvar({ silencioAte: v })}
            min={4}
            max={11}
          />
        </div>
        <p className="mt-2 text-xs leading-snug text-fg-muted">
          Nada é enviado nesta janela. O que vencer durante o silêncio espera até a manhã — não
          se perde e não acorda ninguém.
        </p>
      </fieldset>

      <Divisor />

      <fieldset>
        <legend className="text-sm font-medium text-fg-muted">Por onde</legend>
        <div className="mt-2 flex flex-col gap-1">
          {CANAIS_DE_AVISO.map((canal) => (
            <Switch
              key={canal}
              label={ROTULO_DO_CANAL[canal]}
              checked={prefs.canais.includes(canal)}
              onChange={() => alternarCanal(canal)}
            />
          ))}
        </div>
        {prefs.canais.length === 0 && (
          <p className="mt-2 text-xs leading-snug text-warn-soft-fg">
            Com os dois canais desligados, o Ventus não te procura em lugar nenhum. A agenda
            continua funcionando — só que você vai ter que abrir o app para vê-la.
          </p>
        )}
      </fieldset>

      <Divisor />

      <fieldset>
        <legend className="text-sm font-medium text-fg-muted">O que</legend>
        <div className="mt-2 flex flex-col gap-1">
          {TIPOS_DE_AVISO.map((tipo) => (
            <Switch
              key={tipo.codigo}
              label={tipo.rotulo}
              description={tipo.descricao}
              checked={!prefs.tiposMutados.includes(tipo.codigo)}
              onChange={() => alternarTipo(tipo.codigo)}
            />
          ))}
        </div>
      </fieldset>
    </Secao>
  )
}

function BlocoDePermissao({
  permissao,
  aoPedir,
}: {
  permissao: ReturnType<typeof permissaoDeAviso>
  aoPedir: (p: ReturnType<typeof permissaoDeAviso>) => void
}) {
  if (permissao === 'concedida') {
    return (
      <p className="flex items-center gap-2 text-sm text-ok-soft-fg">
        <Check size={16} aria-hidden className="text-ok" />
        Este aparelho pode receber notificações.
      </p>
    )
  }

  if (permissao === 'negada') {
    return (
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <X size={16} aria-hidden className="text-danger" />
          As notificações estão bloqueadas neste aparelho.
        </p>
        <p className="mt-1 text-xs leading-snug text-fg-muted">
          O navegador não pergunta duas vezes. Para reverter: ajustes do celular → o Ventus →
          Notificações. Enquanto isso, o Telegram entrega tudo igual.
        </p>
      </div>
    )
  }

  if (permissao === 'indisponivel' || precisaInstalarParaAviso()) {
    return (
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Smartphone size={16} aria-hidden className="text-info" />
          Falta instalar o app neste aparelho.
        </p>
        <p className="mt-1 text-xs leading-snug text-fg-muted">
          No iPhone, notificação só chega para app que está na tela de início. Em Ajustes →
          Aparelho tem o passo a passo — são dois toques.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm leading-snug text-fg-muted">
        Este aparelho ainda não autorizou notificações. É uma pergunta só, e o navegador não a
        repete.
      </p>
      <div className="mt-3">
        {/* Tap explícito. Ver la decisión 1 del encabezado. */}
        <Button
          variant="primary"
          size="sm"
          icon={<BellRing size={16} aria-hidden />}
          onClick={async () => {
            const resposta = await pedirPermissaoDeAviso()
            aoPedir(resposta)
            if (resposta === 'concedida') {
              toast({ message: 'Pronto. Os avisos vão chegar aqui.', tone: 'ok' })
            } else if (resposta === 'negada') {
              toast({
                message: 'Sem problema: o Telegram continua entregando tudo.',
                tone: 'neutro',
              })
            }
          }}
        >
          Autorizar notificações
        </Button>
      </div>
      <p className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
        <Chip tone="neutro" size="sm">
          Uma vez só
        </Chip>
        Se recusar agora, dá para reverter nos ajustes do celular.
      </p>
    </div>
  )
}
