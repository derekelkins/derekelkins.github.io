{-# LANGUAGE BangPatterns #-}
import Data.Word
import Data.Bits

-- Returns 0-based bit index of most significant bit that is 1. Assumes input is non-zero.
-- That is, 2^indexOfMostSignificant1 x <= x < 2^(indexOfMostSignificant1 x + 1)
-- From Erik Demaine's presentation in Spring 2012 lectures of MIT 6.851, particularly "Lecture 12: Fusion Trees".
-- Takes 27 (source-level) straight-line word operations.
indexOfMostSignificant1 :: Word64 -> Word64
indexOfMostSignificant1 w = idxMsbyte .|. idxMsbit
    where
        -- top bits of each byte
        !wtbs = w .&. 0x8080808080808080
        
        -- all but top bits of each byte producing 8 7-bit chunks
        !wbbs = w .&. 0x7F7F7F7F7F7F7F7F              

        -- parallel compare of each 7-bit chunk to 0, top bit set in result if 7-bit chunk was not 0
        !pc = parallelCompare 0x8080808080808080 wbbs

        -- top bit of each byte set if the byte has any bits set in w
        !ne = wtbs .|. pc                             

        -- a summary of which bytes (except the first) are non-zero as a 7-bit bitfield, i.e. top bits collected into bottom byte
        !summary = sketch ne `unsafeShiftR` 1

        -- parallel compare summary to powers of two
        !cmpp2 = parallelCompare 0xFFBF9F8F87838180 (0x0101010101010101 * summary)
        
        -- index of most significant non-zero byte * 8
        !idxMsbyte = sumTopBits8 cmpp2                

        -- most significant 7-bits of most significant non-zero byte
        !msbyte = ((w `unsafeShiftR` (fromIntegral idxMsbyte)) .&. 0xFF) `unsafeShiftR` 1

        -- parallel compare msbyte to powers of two
        !cmpp2' = parallelCompare 0xFFBF9F8F87838180 (0x0101010101010101 * msbyte)

        -- index of most significant non-zero bit in msbyte
        !idxMsbit = sumTopBits cmpp2' 

        -- Maps top bits of each byte into lower byte assuming all other bits are 0.
        -- 0x2040810204081 = sum [2^j | j <- map (\i -> 49 - 7*i) [0..7]]
        -- In general if w = 2^(2*k+p) and p = 0 or 1 the formula is:
        -- sum [2^j | j <- map (\i -> w-(2^k-1) - 2^(k+p) - (2^(k+p) - 1)*i) [0..2^k-1]]
        -- Followed by shifting right by w - 2^k
        sketch w = (w * 0x2040810204081) `unsafeShiftR` 56

        parallelCompare w1 w2 = complement (w1 - w2) .&. 0x8080808080808080
        sumTopBits w = ((w `unsafeShiftR` 7) * 0x0101010101010101) `unsafeShiftR` 56
        sumTopBits8 w = ((w `unsafeShiftR` 7) * 0x0808080808080808) `unsafeShiftR` 56

indexOfMostSignificant1_w32 :: Word32 -> Word32
indexOfMostSignificant1_w32 w = idxMsbyte .|. idxMsbit
    where !wtbs = w .&. 0x80808080
          !wbbs = w .&. 0x7F7F7F7F
          !pc = parallelCompare 0x80808080 wbbs
          !ne = wtbs .|. pc
          !summary = sketch ne `unsafeShiftR` 1
          !cmpp2 = parallelCompare 0xFF838180 (0x01010101 * summary)
          !idxMsbyte = sumTopBits8 cmpp2
          !msbyte = ((w `unsafeShiftR` (fromIntegral idxMsbyte)) .&. 0xFF) `unsafeShiftR` 1
          !cmpp2' = parallelCompare 0x87838180 (0x01010101 * msbyte)

          -- extra step when w is not an even power of two
          !cmpp2'' = parallelCompare 0xFFBF9F8F (0x01010101 * msbyte)
          !idxMsbit = sumTopBits cmpp2' + sumTopBits cmpp2''

          sketch w = (w * 0x204081) `unsafeShiftR` 28
          parallelCompare w1 w2 = complement (w1 - w2) .&. 0x80808080
          sumTopBits w = ((w `unsafeShiftR` 7) * 0x01010101) `unsafeShiftR` 24
          sumTopBits8 w = ((w `unsafeShiftR` 7) * 0x08080808) `unsafeShiftR` 24

indexOfMostSignificant1_w16 :: Word16 -> Word16
indexOfMostSignificant1_w16 w = idxMsnibble .|. idxMsbit
    where !wtbs = w .&. 0x8888
          !wbbs = w .&. 0x7777
          !pc = parallelCompare 0x8888 wbbs
          !ne = wtbs .|. pc
          !summary = sketch ne `unsafeShiftR` 1
          !cmpp2 = parallelCompare 0xFB98 (0x1111 * summary)
          !idxMsnibble = sumTopBits4 cmpp2
          !msnibble = ((w `unsafeShiftR` (fromIntegral idxMsnibble)) .&. 0xF) `unsafeShiftR` 1
          !cmpp2' = parallelCompare 0xFB98 (0x1111 * msnibble)
          !idxMsbit = sumTopBits cmpp2'

          sketch w = (w * 0x249) `unsafeShiftR` 12
          parallelCompare w1 w2 = complement (w1 - w2) .&. 0x8888
          sumTopBits w = ((w `unsafeShiftR` 3) * 0x1111) `unsafeShiftR` 12
          sumTopBits4 w = ((w `unsafeShiftR` 3) * 0x4444) `unsafeShiftR` 12
