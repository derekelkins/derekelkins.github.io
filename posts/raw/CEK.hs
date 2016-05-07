module Main where

-- PHOAS for sane input.  The interpreter doesn't operate over these terms though.
data PExpr p = Var !p | Lam (p -> PExpr p) | PExpr p :@ PExpr p | Reflect | Reify | Prim String (Env -> Value)
infixl 9 :@

--fromPExpr :: (forall p. PExpr p) -> Expr
--fromPExpr (Var v) = can't happen with the Rank-2 type
fromPExpr (f :@ x) = fromPExpr f :@: fromPExpr x
fromPExpr Reflect = EReflect
fromPExpr Reify = EReify
fromPExpr (Prim s f) = EPrim s f
fromPExpr (Lam b) = ELam (go 0 (b id))
    where go d (Var v) = EVar (v d)
          go d (Lam b) = ELam ((go $! (d+1)) (b (\d' -> d' - (d + 1))))
          go d (f :@ x) = go d f :@: go d x
          go d Reflect = EReflect
          go d Reify = EReify
          go d (Prim s f) = EPrim s f

toClosure e = case fromPExpr (lam e) of ELam b -> Closure b []

lam b = Lam (b . Var)

-- deBruijn indices, primitives must be wrapped with the appropriate number of lambdas.
data Expr = EVar !Int | ELam Expr | Expr :@: Expr | EReflect | EReify | EPrim String (Env -> Value)
infixl 9 :@:

instance Show Expr where
    showsPrec n = showExpr n [] [c:i | i <- "":map show [1..], c <- ['a'..'z']]
        where showExpr _ env vs (EVar i) =
                case at env i of
                    Nothing -> ("free"++) . ('\'':) . shows i
                    Just v -> (v++)
              showExpr n env (v:vs) (ELam b) = showParen (n > 0) (('\\':) . (v++) . showLam (v:env) vs b)
              showExpr n env vs (f :@: x) = showParen (n > 10) (showExpr 10 env vs f . (' ':) . showExpr 11 env vs x)
              showExpr _ _ _ EReflect = ("Reflect"++)
              showExpr _ _ _ EReify = ("Reify"++)
              showExpr n _ _ (EPrim s _) = (s++)
              showLam env (v:vs) (ELam b) = (' ':) . (v++) . showLam (v:env) vs b
              showLam env vs e = (" -> "++) . showExpr 0 env vs e

at :: [a] -> Int -> Maybe a
at [] _ = Nothing
at (x:_) 0 = Just x
at (_:xs) n = at xs (n-1)

-- reflect c e k
-- Never use Reflect directly
reflect = lam (\_ -> lam (\_ -> lam (\_ -> Reflect)))

-- reify f = f e k -- The c part is represented by the Arg part of the continuation.
-- Never use Reify directly
reify = lam (\_ -> Reify)

data Value = Closure Expr Env | Int !Int | Expr Expr | Env Env | Kont Kont
    deriving (Show)

valueToExpr :: Value -> Expr
valueToExpr v = EPrim (showsPrec 11 v "") (\_ -> v)

valueToPExpr :: Value -> PExpr p
valueToPExpr v = Prim (showsPrec 11 v "") (\_ -> v)

type Env = [Value]

data Kont = Done | Arg Expr Env Kont | Fun Value Kont
    deriving (Show)

-- Primitives

_Zero = Prim "_Zero" (\_ -> Int 0)

_Suc = lam (\_ -> Prim "_Suc" (\(Int i:_) -> Int (i+1)))

-- paraNat n z s
paraNat = lam (\_ -> Prim "paraNat" (\(Int n:_) -> toClosure (\z -> lam (\s -> go z s n))))
    where go z s 0 = z
          go z s n = s :@ valueToPExpr (Int (n-1)) :@ go z s (n-1)

_Done = Prim "_Done" (\_ -> Kont Done)

_Arg = lam (\_ -> lam (\_ -> lam (\_ -> Prim "_Arg" (\(Kont k:Env e:Expr c:_) -> Kont (Arg c e k)))))

_Fun = lam (\_ -> lam (\_ -> Prim "_Fun" (\(Kont k:v:_) -> Kont (Fun v k))))

-- paraKont k d a f
paraKont = lam (\_ -> Prim "paraKont" (\(Kont k:_) -> toClosure (\d -> lam (\a -> lam (\f -> go d a f k)))))
    where go d a f Done = d
          go d a f (Arg c e k) = a :@ valueToPExpr (Expr c) :@ valueToPExpr (Env e) :@ valueToPExpr (Kont k) :@ go d a f k
          go d a f (Fun v k) = f :@ valueToPExpr v :@ valueToPExpr (Kont k) :@ go d a f k

-- typeCase v cl i c e k
typeCase = lam (\_ -> Prim "typeCase" (\(v:_) -> toClosure (\cl -> lam (\i -> lam (\c -> lam (\e -> lam (\k -> go cl i c e k v)))))))
    where go cl i c e k (Closure _ _) = cl
          go cl i c e k (Int _) = i
          go cl i c e k (Expr _) = c
          go cl i c e k (Env _) = e
          go cl i c e k (Kont _) = k

_Nil = Prim "_Nil" (\_ -> Env [])

_Cons = lam (\_ -> lam (\_ -> Prim "_Cons" (\(Env e:v:_) -> Env (v:e))))

-- paraEnv l n c
paraEnv = lam (\_ -> Prim "paraEnv" (\(Env e:_) -> toClosure (\n -> lam (\c -> go n c e))))
    where go n c [] = n
          go n c (v:vs) = c :@ valueToPExpr v :@ valueToPExpr (Env vs) :@ go n c vs

_Var = lam (\_ -> Prim "_Var" (\(Int i:_) -> Expr (EVar i)))

_Lam = lam (\_ -> Prim "_Lam" (\(Expr b:_) -> Expr (ELam b)))

_App = lam (\_ -> lam (\_ -> Prim "_App" (\(Expr x:Expr f:_) -> Expr (f :@: x))))

_Reflect = Prim "_Reflect" (\_ -> Expr EReflect)

_Reify = Prim "_Reify" (\_ -> Expr EReify)

_Inject = lam (\_ -> Prim "_Inject" (\(v:_) -> Expr (valueToExpr v)))

-- The idea is that you'd do: getPrim :@ _Cons and than would give you an Expr node representing _Cons.
-- Currently this evaluates its argument which is harmless for all the current primitives.  This
-- could be avoided by using reflect.  This could be implemented with paraExpr as well.
getPrim = reify :@ lam (\_ -> lam (\_ -> Prim "getPrim" (\(Kont (Arg c _ _):_) -> toClosure (\_ -> go c))))
    where go (ELam b) = go b
          go c@(EPrim _ _) = valueToPExpr (Expr c)

-- paraExpr c v l a rt ry p
paraExpr = lam (\_ -> Prim "paraExpr" (\(Expr c:_) -> toClosure (\v -> lam (\l -> lam (\a -> lam (\rt -> lam (\ry -> lam (\p -> go v l a rt ry p c))))))))
    where go v l a rt ry p (EVar i) = v :@ valueToPExpr (Int i)
          go v l a rt ry p (ELam b) = l :@ valueToPExpr (Expr b) :@ go v l a rt ry p b
          go v l a rt ry p (f :@: x) = a :@ valueToPExpr (Expr f) :@ valueToPExpr (Expr x) :@ go v l a rt ry p f :@ go v l a rt ry p x
          go v l a rt ry p EReflect = rt
          go v l a rt ry p EReify = ry
          go v l a rt ry p c@(EPrim _ _) = p :@ valueToPExpr (Expr c)

-- Library

one = _Suc :@ _Zero

identity = lam (\x -> x)

loop = lam (\x -> x :@ x) :@ lam (\x -> x :@ x)

tailEnv = lam (\e -> paraEnv :@ e :@ _Nil 
                                  :@ lam (\_ -> lam (\x -> lam (\_ -> x))))

tailKont = lam (\k -> paraKont :@ k :@ _Done
                                    :@ lam (\_ -> lam (\_ -> lam (\x -> lam (\_ -> x))))
                                    :@ lam (\_ -> lam (\x -> lam (\_ -> x))))

eval = lam (\c -> reify :@ lam (\e -> lam (\k -> reflect :@ c :@ (tailEnv :@ e) :@ k)))

quote = reify :@ lam (\e -> lam (\k -> reflect :@ (_Inject :@ c k) :@ e :@ (tailKont :@ k)))
    where c k = paraKont :@ k :@ garbage 
                              :@ lam (\x -> (lam (\_ -> lam (\_ -> lam (\_ -> x))))) 
                              :@ lam (\_ -> lam (\_ -> lam (\_ -> garbage)))
          garbage = _Inject :@ _Zero

callCC = lam (\f -> reify :@ lam (\e -> lam (\k -> 
            f :@ lam (\a -> reflect :@ (_Inject :@ a) :@ (tailEnv :@ e) :@ k))))

-- Examples

example1 = evaluate $ quote :@ loop -- output looks like: Expr ((\a -> a a) (\a -> a a))
example2 = evaluate $ eval :@ (quote :@ loop) -- loops forever
example3 = evaluate $ callCC :@ lam (\k -> k :@ one :@ loop) -- escape before evaluating the loop
example4 = evaluate $ callCC :@ lam (\k -> lam (\_ -> loop) :@ (k :@ one)) -- also escape before the loop

-- Evaluator

-- eval :: (forall p. PExpr p) -> Value
evaluate e = evaluate' (fromPExpr e)

evaluate' :: Expr -> Value
evaluate' e = cek e [] Done

inject :: Value -> (Expr, Env)
inject (Closure b env) = (ELam b, env)
inject v = (valueToExpr v, [])
 
cek :: Expr -> Env -> Kont -> Value
cek (EVar i) env k = cek e env' k where (e, env') = inject (env !! i)
cek (f :@: x) env k = cek f env (Arg x env k)
cek (ELam b) env Done = Closure b env
cek (ELam b) env (Arg x env' k) = cek x env' (Fun (Closure b env) k)
cek (ELam b) env (Fun (Closure b' env') k) = cek b' (Closure b env:env') k
cek EReify (Closure b env':env) k = cek b (Env env:env') (Arg (valueToExpr (Kont k)) [] k)
cek EReflect (Kont k:Env e:Expr c:_) _ = cek c e k
cek (EPrim _ f) env Done = f env
cek (EPrim _ f) env (Arg x env' k) = cek x env' (Fun (f env) k)
cek (EPrim _ f) env (Fun (Closure b' env') k) = cek b' (f env:env') k
